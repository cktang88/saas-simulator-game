# Operator-tier audit (ARCHITECTURE principle 7)

Scope: every app in `public/apps/` (31 registered apps, plus the helper directories `sales/ success/ growth/ channels/ money/ fundraising/ product/ support/ insights/ people/ legal/ cofounder/ marketworld/ outcomes/`) against principle 7: stellar / good / average / mediocre must separate through what the player does, with calibrated spreads, un-gameable detection, coaching, a test that the tiers separate, and (new addendum) **bad play must always cost something that is realistic and traceable**.

Companion data: `public/data/operator-tiers.js` (28 functions, tier behaviours, outcome spreads, traps, detection). Research: `docs/research/operators/o1..o5`. Method: grep plus reading the decision functions named below. Line numbers are as of this commit. Where I did not read a code path to the end I say "appears".

Verdict scale: **strong** (real skill input, hard to game, calibrated, coached, tested), **partial** (some of the five missing or weak), **weak** (skill barely matters, or is gameable), **missing** (function not simulated, or only a toggle).

Consequence scale (new column): **none** (free mistake), **too small**, **realistic**; and **traceable? yes / partly / no** = does the player later learn what the mistake cost.

---

## 1. Per-function verdicts (one line each)

| # | Function | Verdict | Consequence of bad play | One line |
|---|---|---|---|---|
| 1 | Prospecting / lists | partial | realistic, traceable | Verification, bounce truth and `specificity()` are good; ICP quality (filters, triggers, reason per account) is never read. |
| 2 | Cold email / LinkedIn | strong | realistic, traceable | Tiered reply gate 1/3/6.5/13%, copy multiplier, repeat-ask decay, re-enrol penalty, domain reputation; lacks a 4-tier separation test. |
| 3 | Discovery / demo | partial | realistic, partly traceable | Scorecard + hidden persona facts are good; regex scoring (`GOOD_Q`) is stuffable offline; no recap/latency signal. |
| 4 | Deal management | partial | realistic for committees, none for hygiene | Buying committees, hidden stakeholders, budget fit, security gates are strong; stale/zombie deals and forecast discipline cost nothing. |
| 5 | Customer success | partial | realistic, traceable | Health score drives churn 0.4x-2.5x, QBRs, renewal negotiation; renewal window opens automatically at T-90 so early starts do not separate players; no success-metric plan. |
| 6 | Positioning / landing | partial | realistic, partly traceable | Hidden website score drives conversion 0.3-1.7x; judged by keyword heuristic offline; no per-source conversion or one-change test discipline. |
| 7 | Paid ads | strong | realistic, traceable | Learning phase, entity dedupe, fatigue, attribution lag, kill-rule hints, CPA ratio tested at 1.5-2.6x; missing holdout/incrementality. |
| 8 | Content / SEO / GEO / BIP | partial | too small for volume | Judged posts/articles drive reach; posting volume has no audience fatigue; Scorecard rewards counts. |
| 9 | Launch / community / referral | partial | realistic for spam, small for single-launch | Community removal/bans, PH once-only, k-factor from reward; no pre-launch list sequencing credit. |
| 10 | Pricing / packaging | strong | realistic, traceable | Notice, grandfathering, backlash modifier, A/B with significance, WTP elasticity, survey methods; no cost for stopping tests early. |
| 11 | Lifecycle / activation | weak | too small | Activation is a model output of fit x onboarding mode; player never defines the event, writes sequences or segments. |
| 12 | Customer discovery | strong | realistic, traceable | Hidden persona facts released only to past-specific questions, grading, logged-vs-claimed interviews, synthetic never counts as evidence. |
| 13 | Prioritisation / specs | partial | too small | Spec lint + rubric strong; true value is keyword heuristics on solution/problem text; unvalidated features cost little; no post-ship metric check or kill. |
| 14 | AI building | weak | none | Bug rate depends on a single `people.aiReview` flag (`people/capacity.js:57`); no diff size, tests or refactor decisions. |
| 15 | Analytics / experiments / PMF | missing | none | No PMF survey, no experiment log or stop rule; Scorecard `pmf_measurement` counts churn-survey rows. |
| 16 | Support | partial | realistic | FRT to churn, CSAT, docs to AI resolution, 8% AI error; AI agent is an on/off toggle; `replyQuality` keyword-gameable. |
| 17 | Cash / runway | weak | none | Runway widget and flags exist; no forecast, no scenarios, runway has no effect on raise leverage. |
| 18 | Bookkeeping / close / tax | strong | realistic, traceable | Truth ledger vs reported books, wrong-category guesses, close checklist with tie-outs, filing penalties; no tier readout. |
| 19 | Payments / dunning | weak | none (defaults are stellar) | Smart Retries and dunning emails default ON; doing nothing equals a good operator; recovery not shaped by sequence design. |
| 20 | Legal hygiene | strong | realistic, traceable | 83(b) 30-day miss, IP/CIIAA, DPA, SOC 2 gate, diligence red flags that make investors pass. |
| 21 | Hiring | strong | realistic, partly traceable | Scorecard, graded questions, work samples, channel quality, noisy evidence of hidden traits; hire-quality feedback loop is thin. |
| 22 | People management | weak | none/too small | Morale driven only by pay, equity, founder energy, runway; no 1:1, feedback, 30/60/90 or documented-performance input. |
| 23 | Fundraising | strong | realistic, traceable | Rubric, thesis fit, warm vs cold, follow-up decay, stale raise, competing leads, reputation; runway and re-pitch spraying have no cost. |
| 24 | Investor relations | strong | realistic, traceable | Update quality judged, warmth, hidden bad news penalty at raise, missed board meetings. |
| 25 | Partnerships / channels | partial | mixed | Many channels with realistic ramp and fees, affiliate fraud review; partner choice has no ICP-fit tiering read-out. |
| 26 | Founder time / calendar / inbox | partial | realistic for overbooking, none for scams | Hours, overtime, missed meetings, context switching, intro funnel by tie strength; scam engagement costs only hours; focus blocks give no output benefit. |
| 27 | Automation / AI leverage | weak | none | AI SDR and support agent exist with hallucination and reputation costs; no review step, no tool-cost audit. |
| 28 | Founder sustainability | partial | realistic for burnout, none for drift | Energy, wellbeing events, burnout warnings; no kill criteria and no pivot-frequency signal. |

Counts: strong 9, partial 12, weak 6, missing 1. The one **missing** function (analytics / PMF / experiments) and the **weak** group (activation, AI building, dunning, people management, automation, cash) are where mediocre play is currently free.

---

## 2. Free-mistakes register (read this first)

Each row is a wrong or mediocre action that costs nothing today, or too little, or costs without the player learning why.

| Free mistake | Where it happens (file:line) | Today | Fix (summary) |
|---|---|---|---|
| Ignoring failed payments | `core/stripe.js:31` (`smartRetries: true`) and `core/stripe.js:280-282` (retry odds); app `stripe.js:282` `st.settings.dunningEmails ??= true` | A player who never opens Billing gets the stellar recovery. Mediocre is only reachable by switching things off. | Default to the processor default (one email, plain retries); make a multi-step sequence (timings, copy, card-update link) a player-authored setting that lifts recovery from ~45% to ~75% and show recovery by cohort. |
| Hiring without structure | `people/interview.js:108` `interviewExecution`, `people/hiring.js:67` `candQuality` | Unstructured loops give noisier evidence, but a lucky hire is still fine and a bad hire is never traced to the missing scorecard. | Record `hiredWithScorecard/workSample/references` on the member; surface it in the monthly performance read and exit note ("you skipped references"). |
| Spamming outreach | `sales/engine.js:74` `sendSequences`, `sales/deliverability.js:70` | Costs hours (0.1 + 0.005 per contact, `sales/params.js:106`) and domain reputation (-8 per complaint). A burnt secondary domain can be replaced. No effect on company brand, no cost to later campaigns. | Add a brand/ICP-saturation cost: contacts hit 3+ times or marked spam are suppressed from the market pool; repeated domain burns raise the next domain's warm-up and cost. Show "pool burned" on the list. |
| Spray-and-pray investor pitching | `fundraising/sim.js:146` `stale`; `view-crm.js:71` passed investors blocked within a raise | Passed investors cannot be re-pitched inside the same raise (good). Contacting 100 cold investors costs hours but no `fr.reputation` change (`sim.js:114`: reputation only moves on no-shows, reschedules, missed boards). | Add a market-talk penalty: many passes with the same reason in 30 days lowers `fr.reputation`; show "N investors passed, top reason" as the coaching read. |
| Raising with low runway | `fundraising/sim.js` (no runway read; only `metrics.js:51` for the sheet) | A founder with 3 months of cash gets the same terms as one with 12. | Scale term and close odds by runway at start (leverage), and add "forced to accept first term sheet" when runway under 4 months. |
| Skipping 83(b) | `legal/sim.js:457-470` | **Costed**: personal tax at each vesting after the cliff, diligence flag (`legal/sim.js:396`). Realistic and traceable (notify + diligence). Keep. | Add the effect size in $ to the notification and the Scorecard read-out. |
| Shipping unvalidated features | `product/fit.js:23-47` `heuristicValue` | Relevance is `min(1, ICP-token hits / 3)`; real interview evidence adds only +0.2 (`fit.js:29`). A fluent spec that mirrors ICP words scores like a validated one. Only a Scorecard warning at 4+ features on <3 interviews (`outcomes/engine.js:334`). | Weight relevance by real evidence (linked real insights, commitments); unvalidated features start with a hidden demand discount and a post-ship "nobody used it" read (adoption via `insights/model.js:23`), plus a rebuild cost. |
| Raising prices with no grandfathering | `channels/pricing-sim.js:196-256`, `money/judge.js:101` | **Costed** realistically (churn from `priceIncreaseChurn`, backlash modifier at under 14 days notice and weak comms). Keep. | Add a post-mortem line ("27% of affected accounts churned vs ~4% with grandfathering") on the Pricing page. |
| Going in circles on features | `product/store.js`, `product.js` (no rejected/rebuilt feature cost beyond hours) | A rejected or abandoned spec costs hours only. | Add a rebuild tax: reshipping a feature that was queued, built and killed within 90 days costs +25% effort, and shows in a "decisions log". |
| Re-launching Product Hunt / re-launching generally | `growth/organicEngine.js:131` throws if already launched | Once only (good). But network launches and communities can repeat. | `launchToNetwork` repeat within 90 days should convert at a fraction (audience fatigue). |
| Posting volume | `growth/organicEngine.js:80`, `growth/organicModel.js:68` | Reach scales with followers x judged skill; posting 20x a day costs only hours; no follower fatigue or unfollow. | Add per-platform frequency decay and unfollow when low-skill posts are frequent. |
| Counting-based luck exploit | `outcomes/engine.js:49-82` `activity()` | `publicPostsPerWeek`, `outboundTouchesPerWeek`, `contentPiecesPerMonth` count every post/send regardless of judged quality, and they raise the odds of lucky breaks. | Weight each item by its judged quality (post skill, copy score, reply-gated sends). |
| Scam / pay-to-play engagement | `messages.js:91`, `core/network.js:226`; no pay action | Engaging a scam costs only the hours of the replies. | Add a "pay the fee" decision for scam/waste offers that debits the bank and records the lesson. |
| AI agent (support) with no handoff or scope | `helpdesk.js:41` `ai: { enabled }`; `support/model.js:17` fixed 8% error | One toggle. A bad setup and a good setup behave the same. | Config: scope intents, handoff rule, tested-on-past-tickets; wrong-answer rate depends on them. |
| AI coding without review | `people/capacity.js:57-61`, `product.js:52` | One boolean `people.aiReview`. | Per build session: diff size, tests-first, review choice change bug rate and rework (0.15 baseline to 0.3-0.8). |
| Stopping an A/B test early and adopting | `pricing-sim.js:91-117`, `abResults` `enough` flag | The `enough` flag is only displayed. Adopting a noise winner costs only via the hidden WTP later. | Log "adopted before significance" and show later cohort revenue vs the claim. |
| Founder focus blocks | `core/calendar.js:109-123` | Focus blocks only avoid the context-switch hour; they give no output benefit. | Give focus-block hours a productivity multiplier on build/writing work. |
| Missing cash forecast | `bank.js:86-112` | Runway widget only. | Forecast with scenarios; compare forecast to reality for a tier read. |

"Going in circles" consequences that **do** exist: expired trial pipeline, re-enrol penalty (`sales/params.js:94` reenroll replyMult 0.4, complaintMult 2), repeat-ask halving (`:92`), PH once, community bans (`organicModel.js:90-92`), burnt domains (`deliverability.js:73`), missed board meeting (`ir.js:242`), 83(b), Delaware late penalty (`money/compliance.js:64`), misclassification (`people/sim.js:747`). They are the model to copy.

---

## 3. Findings by owning area

Format per function: (a) skill inputs today; (b) un-gameable?; (c) spread vs research; (d) coaching; (e) tier test; (f) verdict and fixes. A consequence line closes each block.

### 3.1 Core (`public/core/`, `public/main.js`, shared)

**Market conversion (`core/market.js`)**
- (a) `websiteFactor` 0.3 + 1.4 x score (`:42-47`), `productFactor` 0.4 + 1.0 x score (`:48-53`), `priceFactor` elasticity (`:71-78`), `trialConversion` (`:95`), `churnBeforeRenewal` with `productFactor^-0.7` and per-sub `churnMult x csChurnMult` (`:110`). These are the one place where every function's quality becomes revenue.
- (b) Inputs are scores produced elsewhere; unjudged defaults are 0.35 / 0.3 ("mediocre", `:41`), which is the right default.
- (c) Website spread 0.3-1.7x (5.7x) vs research 3-4x (o2 s1). Slightly steep at the extremes; trim the multiplier to roughly 0.45 + 1.15 x score (0.45-1.6x, about 3.5x). Product factor 0.4-1.4x (3.5x) fine.
- (d) None here; coaching must live in each owner.
- (e) `test/market.test.js` checks fits and conversions; no tier test.
- (f) **partial**. Fix: add `core/operator.js` (see 5.1) to translate each owner's score into a named tier, so every spread above can be read and asserted in one place.

**Clock / wellbeing (`core/wellbeing.js`, `core/calendar.js`)**
- (a) Hours charged per action, overtime, missed meetings past `MEETING_OVERTIME`, context switching `CONTEXT_SWITCH` (`calendar.js:11`, `:109-125`), energy below 40 gives velocity x0.8 (`wellbeing.js:27-40`).
- (b) Not gameable by clicking: hours are finite.
- (c) Realistic. The research [design] gap (stellar 15-20 maker hours, mediocre <3) is not read out.
- (d) Notifications on overbooking only.
- (e) `core.test.js:110` tests calendar conflicts and overtime, not tiers.
- (f) **partial**. Fix: record `makerHours` (consecutive 3h+ unfragmented blocks with work charged) and give those hours a 1.15x output multiplier on build and writing actions (`ctx.act` in `main.js`); report "deep-work hours this week" on `you.js`.

**Network funnel (`core/network.js`)**
- (a) `introDecision` (`:241`): tie strength, forwardable blurb (45+ words crisp, 20 sloppy, none), connector fatigue -15% per ask within 90 days, target type. Inbound archetypes by company stage and public events.
- (b) Blurb length is the only text signal (`:248`): padding to 45 words beats it. Replace with an LLM/heuristic judge on forwardability (names the ask, a one-line reason, no attachments needed).
- (c) Funnel spread follows the research table in `data/inbound-archetypes.js`.
- (d) None beyond result text.
- (e) None.
- (f) **partial**. Fixes: judge blurb content; coach "why the intro died".

### 3.2 Sales and success (`sales/`, `crm.js`, `outreach.js`, `calls.js`, `success.js`, `customers.js`)

**Prospecting (crm.js, outreach.js, sales/csv.js, sales/copy.js)**
- (a) `verifyContacts` (`sales/model.js:119`) with true address status (valid/catch-all/invalid/unknown shares, `sales/params.js`); role-address penalty; `specificity()` (`copy.js:84`) rewards tokens found on the real fetched site, numbers and proper nouns, punishes flattery (`:88-89`); `heuristicResearch` (`jobs.js:260`) scores ICP overlap.
- (b) `specificity` is partly gameable: copying phrases from the fetched site text into the line raises the score without insight. Partially mitigated by `tierFor` requiring spec >= 0.55 for "researched" (`replies.js:16-26`). Add a check that the personalisation differs per company and is not a template with swapped nouns.
- (c) `replyTier` generic 1% / basic 3% / researched 6.5% / warm 13% (`sales/params.js:18`) vs research: generic 0.5-1.5%, segment-relevant 2-4%, researched 5-10%, warm 10-20%. Matches. Positive-reply multiplier from list quality (o1: 2-3x) is **missing**: the ICP text never changes tier, only per-contact fit via `fitMultiplier`.
- (d) Issues list from `analyzeCopy` and the verify summary; no coaching on list design.
- (e) `sales.test.js:123,150,553` test verification and specificity; no ICP-tier test.
- (f) **partial**. Fixes: (1) `sales/segments.js` `icpSegments`/`assignIcpSegment`: score ICP text for filter count and trigger presence and apply it to the synthetic prospect pool fit (target: stellar ICP raises positive-reply rate 2-3x vs title+size ICP; mediocre 0.3-0.7x); (2) per-account "reason on list" field and a trigger check that removes a non-matching account; (3) coaching callout in CRM: bounce %, wrong-persona %, accounts worked vs added; (4) test: three lists (broad title, firmographic, triggered) at equal volume, assert positive-reply ratios 1 : 1.5-2 : 2-3.
- Consequence: bounce >2% costs reputation (`deliverability.js:78`), traceable in domain health. Broad list costs nothing beyond lower fit. Too small.

**Cold email and LinkedIn (outreach.js, sales/replies.js, sales/copy.js, sales/jobs.js, sales/deliverability.js)**
- (a) `analyzeCopy` (`copy.js:35`): words, links in email 1, ask count, hard CTA, buzzwords, AI slop, spam words, opt-out; `judgeToQuality` panel (`jobs.js:202`); step weights `[0.5, 0.2, ...]` (`params.js:21`); `copyMultiplier(q) = 0.3 + q` (`replies.js:28`); inbox placement from auth, warmup, spam (`deliverability.js:43`); reputation update (`:70`); repeat-ask halving (`params.js:92`).
- (b) Keyword lists can be dodged by synonyms; mitigated by the LLM panel online and by `tierFor` (a clean template with no `{{personalization}}` stays generic, `replies.js:20-25`). A link-free, 70-word, opt-out email with a copied site phrase still scores well offline: add per-recipient uniqueness (same body hash across more than 20 recipients caps quality at 0.5).
- (c) Stellar vs average: (6.5% x ~1.2) / (3% x ~0.9) = 2.9x, in line with Lavender (2-3x). Mediocre generic with slop: 1% x 0.5 = 0.5% vs 3% average (6x gap) vs research "<1% vs median 3-4%". Good. LinkedIn note vs no note: connected lift x1.6 (`params.js:23`); note reply +72% (Belkins) is not separately modeled.
- (d) Strong: `analyzeCopy.issues` plus the judge `fixes`.
- (e) `sales.test.js:178` (reply gate per tier), `:314`, `:340` (generic blast to a cold domain). Tests assert research ranges, not the four named tiers side by side.
- (f) **strong**. Fixes (small): (1) one test `operators.test.js` that runs four archetype players over the same 400-prospect list (see 5.3) and asserts replies/meetings ordering and the 2-3x / 6x gaps; (2) uniqueness cap above; (3) model LinkedIn note vs plain (accept 26% either way, message reply 9.4% vs 5.4%).
- Consequence: realistic (domain reputation -8 per complaint, burnt domain recovery capped at 60, `deliverability.js:71-77`), traceable (domain health). Missing: brand/market burn (see register).

**Discovery and demos (calls.js, sales/scorecard.js, sales/engine.js)**
- (a) Live chat with a persona whose budget, authority, pain and timeline are hidden (`replies.js:104`, `scorecard.js:127-158`); budget only disclosed after `goodQuestions >= 3` (`scorecard.js:138`); scorecard via LLM or `heuristicScorecard` (`:64`): talk ratio, questions, Mom Test violations, MEDDICC flags, competitive handling; `callQuality` (`deals.js:68`) needs >= 3 questions before talk or cleanliness earn credit; qualify odds `(0.5 + quality) x ...` (`deals.js:82`); empty calls cannot qualify (`:84`).
- (b) Offline `heuristicScorecard` is regex-driven: `GOOD_Q` (`scorecard.js:29`) counts one hit per founder turn, so a turn stuffed with "last time / walk me through / who else / what happens if" scores. Real follow-up detection is missing: check that a question references a noun from the previous prospect answer (o1 s3 anti-gaming).
- (c) `callQuality` spans 0-1; qualify multiplier 0.5-1.5x (3x) and close multiplier `0.6 + 0.8 x quality` (2.3x) combine to ~7x between a pitch and an excellent call. Research (o1): top performers close ~11x faster; 4-5x relative win gap is plausible. Reasonable, slightly steep; keep.
- (d) `coaching[]` is good ("You talked 62%..."), but it never says what a stellar operator did on the same call (11-14 questions, dollars, status quo, who else, dated next step). Add `stellarWouldHave`.
- (e) `sales.test.js:223` (good vs bad transcript), `:389`, `:517`. Binary.
- (f) **partial**. Fixes: (1) follow-up-references-answer detector in `heuristicScorecard`, (2) cap `good` at 1 credit per distinct question topic, (3) recap-email latency and dated next-step as `callQuality` inputs (calendar/CRM state), (4) four-tier transcript fixtures in `test/operators.test.js`.
- Consequence: realistic (pitch-first stalls at stage 1, budget never disclosed), traceable via scorecard. OK.

**Deal management (crm.js, sales/segments.js, sales/engine.js, sales/model.js, sales/competition.js, pricing.js discount guardrails)**
- (a) Buying committees with hidden stakeholders and stances (`segments.js:150-262`), `committeeEffect` (`:264`), `reachStakeholder`/`mapBuyingGroup` (`model.js:405-440`), methodology per segment (BANT, MEDDPICC; `segments.js:74`), budget fit (`deals.js:98`), no economic-buyer access closes far less (`segments.test.js:92`), discount guardrails (`pricing-model.js:42-65`), champion turnover (`engine.js:487`), security reviews/DPA/SOC 2 gates (`engine.js:425`).
- (b) Strongly gated by hidden state: you cannot fake the committee map.
- (c) Qualified win rates by ACV `[[15000, .30], [100000, .23], [Inf, .17]]` (`params.js:80`) vs research average 20-30%, best 35-40%. Stellar play can reach roughly 0.3 x 1.4 x budget 1.2 = 0.5, so the top is fine. Mediocre (single-thread, proposal first) is covered by `committeeEffect`.
- (d) MEDDPICC panel fills from scorecards (`segments.test.js:172`): good. Missing: forecast calibration and a stale-deal read.
- (e) Segment tests are scenario tests, not tier tests.
- (f) **partial**. Fixes: (1) days-since-last-buyer-contact stale flag with decay of win odds after 21 days, (2) "forecast" panel: stage-weighted pipeline vs realised (weekly), showing error % and coaching "you had 100% in commit", (3) early-discount penalty only fires via the guardrail; add "discounted before a buyer budget was stated" memory and show it in the won/lost debrief.
- Consequence: realistic for committee mistakes, **none** for pipeline hygiene (zombie deals), too small for early discounting (+15% close odds per 30% discount in `deals.js:112`, which rewards discounting; the cost is margin only). Reverse: remove the positive discount effect beyond the guardrail (already "buy no extra odds" per `sales.test.js:501`).

**Customer success (success.js, success/model.js, success/engine.js)**
- (a) `healthScore` (`model.js:53`): usage 38%, champion 20%, QBR recency 12%, support 12%, touch 10%, open asks 8%; `churnMultFromHealth` `2^((60-h)/25)` clamped 0.4-2.5 (`:65`); renewal pipeline T-90/60/30 (`CS.renewalWindows`); `renewalAcceptance` uses uplift, discount, term, health, call score (`:79`); `renewalCallScore` reads the call (`:94`); expansion only with real seat room; QBR on the calendar; unattended QBR hurts.
- (b) Hard: usage and champion are hidden state; QBR must be attended.
- (c) Churn multiplier spread 6x (0.4-2.5) between well-run and neglected accounts. Research NRR: top quartile 111 vs bottom 97 (14 points) for $25-50k ACV. A 6x multiplier on a ~10% annual churn (0.04 to 0.25) gives GRR 96% vs 75%: **too steep** at the bottom; target 0.6-1.8x (3x). Check against `docs/review/calibration` before changing.
- (d) Renewal call coaching exists via the call score; no read-out of "start 90-120 days out with usage data".
- (e) `success.test.js:40,48,213` test health reactions and acceptance caps, not tiers.
- (f) **partial**. Fixes: (1) per-account success plan (metric + target + date, validated for number and date) as a health input (replace the flat `touch`), (2) player-initiated early renewal conversation (T-120) should raise acceptance +5-8 points; today the pipeline opens automatically (`engine.js:165`) so waiting costs nothing, (3) NRR / GRR tier readout with quartile bands, (4) trim churn multiplier to 0.6-1.8.
- Consequence: realistic for neglect (churn), too steep at the bottom; traceable via health breakdown.

**Customers app / panel (customers.js, product/panel.js)**
- (a) Onboarding mode (self/call/concierge x 1/1.6/2.2 conversion, `core/params.js:130`), AI trial users judge what you shipped, exit survey, feedback inbox that must be answered within 5 days (`panel.js:17` `ignoreDays`).
- (b) Concierge multiplier is bought with hours: not gameable.
- (c) Concierge 2.2x conversion vs self-serve is steep but time-limited (1.5 h per trial).
- (d) Panel text. (e) `product.test.js` covers panel pieces.
- (f) **partial**. Fix: add a "Sean Ellis" survey restricted to activated users (see 3.4 analytics fixes).

### 3.3 Growth, marketing, channels, pricing (`ads.js`, `organic.js`, `channels.js`, `pricing.js`, `website.js`, `market.js`, `growth/`, `channels/`, `marketworld/`)

**Paid ads (ads.js, growth/adsEngine.js, growth/delivery.js, growth/judges.js)**
- (a) Creative judged by a panel (hook, clarity, relevance, specificity, stop-scroll; `judges.js:60-90`), hidden draw `u` seeded from normalised copy so identical or >= 0.6-similar copy joins the same entity and shares wear (`adsEngine.js:107-140`), skill shifts the draw `q = u^gamma` (`delivery.js:58`), learning phase and budget edit rules (`adsEngine.js:92`, `delivery.js:100`), fatigue (`delivery.js:75-83`), attribution lag and pixel/CAPI reporting (`delivery.js:111-122`, `adsEngine.js:498-538`), `ruleHint` kill/scale rules (`delivery.js:293`), cohort ROAS vs Stripe (`growth/acquire.js:144`).
- (b) Strong: re-roll is blocked by entity merging; offline judgments move the draw less (`effectiveSkill`, `adsEngine.js:122`); 50 reviews per day cap.
- (c) Winner share 5% neutral, ~10% strong, ~2.5% generic (Motion 2026); CPA ratio winner/average 1.5-2.6x (`growth.test.js:387`) vs o2 "2-3x stellar vs average". Matches.
- (d) `ruleHint` coaching tells what to kill/scale; no "stellar would have set a CPA ceiling from LTV before spending" check. `defaultTargetCpa` (`adsEngine.js:51`) pre-fills the ceiling so the player never has to derive it.
- (e) `growth.test.js:77,387` test skill-to-winner and CPA spread. Not four tiers over a whole account.
- (f) **strong**. Fixes: (1) make `targetCpa` required and compare it with LTV/payback from Analytics; mark unsafe ceilings (> LTV/3) and show it in the account debrief, (2) retargeting audience (`adsEngine.js:307`) converts at cvr 2.0 without subtracting visitors who would have converted organically: add a cannibalisation factor (reported vs incremental), plus a holdout test (budget split with a control), (3) learning-edit counter in the debrief ("11 edits in 14 days, learning never exited, ~25% efficiency lost"), (4) tier test: four players on the same product and 30 days, assert blended CPA ordering with 2-3x spread.
- Consequence: realistic and traceable (learning efficiency, fatigue, reported vs actual ROAS).

**Organic growth (organic.js, growth/organicEngine.js, growth/organicModel.js)**
- (a) Posts (`publishPost`, `:80`), SEO articles (`publishArticle`, `:99`, position draw by quality and slop), community posts (`communityPost`, `:112`; removal and ban odds `organicModel.js:86-96`), network launch (`organicModel.js:106`), Product Hunt once-only (`organicEngine.js:131`; top-3 <5% base rate), referral k-factor from reward (`organicModel.js:138`), newsletters.
- (b) The judges are keyword-heuristic offline (`judges.js:168`, `:253`): add per-recipient and per-post uniqueness and product-specificity; the check "claimed numbers match the company metrics" (o2 s3) is missing.
- (c) Reach `followers x rate x (0.3 + 1.7 skill^2)` (`organicModel.js:68`): 5.7x spread skill 0 to 1; research gives no benchmark ([design] 3-5x for content). Reasonable. PH ranking base rates sourced.
- (d) Judges give feedback; none says what a stellar launch looks like (pre-launch list 4-8 weeks, sequence network then niche then broad).
- (e) `growth.test.js:296,373` (slop ranks worse, stuffing scores low).
- (f) **partial**. Fixes: (1) frequency decay and unfollow (see register), (2) launch sequencing credit: a launch preceded by 4+ weeks of early-user list/waitlist, then network then niche community, multiplies PH signups 3-10x [design]; a cold broad launch gets the base, (3) quality-weighted `activity()` for Scorecard, (4) referral: require a tracked reward; k near the no-programme baseline if untracked.
- Consequence: communities realistic; posting spam too small.

**Channels and partnerships (channels.js, channels/sim.js, channels/model.js, channels/judge.js, channels/catalog.js)**
- (a) 15+ channels with setup hours, costs, time to first result, ramp, noise and fees (`channels/sim.js`), player-written pitches judged (`channels/judge.js:49`), affiliate fraud review (`sim.js:325`), reviews asked with/without incentive (`:964`), LTD (`:1138`), conferences, PR firm, direct mail.
- (b) Pitches judged by heuristics offline (`judge.js:49`); keyword gaming possible; partner behaviour (referrals per month) is outside the player's control (good).
- (c) Steady-state ranges follow `data/channels.js`. Partner-sourced share (o5: young single digit, mature 20-30%) not tier-split.
- (d) Per-channel result summaries; no "which partner types would a stellar operator pick".
- (e) `channels.test.js:54,95` (steady state, PR reply rate by quality).
- (f) **partial**. Fixes: (1) partner fit score = overlap of the partner's customers with `state.company.icp` that sets referral rate (0.2 vs 3 per quarter), (2) a 90-day no-pipeline kill prompt, (3) show sourced vs influenced separately, (4) tier test on partner choice.
- Consequence: realistic for fees/rev-share; logo-collecting has hour cost only (too small).

**Pricing (pricing.js, channels/pricing-sim.js, channels/pricing-model.js, channels/stats.js)**
- (a) Model and value metric, tiers, trial modes, A/B tests with two-proportion and Welch tests and sample size (`pricing-sim.js:81-148`), Van Westendorp / Gabor-Granger on a panel or real customer survey (`:259-300`), increases with notice, grandfathering, lock-in, comms judge (`:196-256`, `money/judge.js:80`), discount guardrails at quarter end (`pricing-model.js:30-65`).
- (b) Strong. Customer survey skew corrected for existing customers. The price is judged against hidden WTP so claimed "tested" without data does not help.
- (c) Price/volume through `priceFactor` elasticity; increase churn modelled. Matches o2 s5 qualitatively; the 20-50% tested premium is emergent, not asserted.
- (d) Panel/survey outputs, `priceIncreaseOutlook`, notice judge; no explicit "a stellar operator would have done X".
- (e) `channels.test.js` and `market.test.js` cover parts; `money-core.test.js:337` annual refunds.
- (f) **strong**. Fixes: post-mortem line per increase and per adopted test (register), tier test: same product, four pricing playbooks (copy competitor / cost-plus / tested / tested+raise with notice) and assert 12-month revenue ordering with the tested path 15-35% ahead [design].
- Consequence: realistic and traceable.

**Website and market (website.js, market.js, marketworld/)**
- (a) Hidden page score from a persona panel on the real fetched or pasted page (`website.js:73-107`), `heuristicJudge` offline (`:48`); stored score kept if the page is unchanged (no re-roll); competitors and world events with response choices (`marketworld/engine.js`), battlecard writing.
- (b) Offline: CTA regex over all text (`:56`) and ICP hits can be satisfied by pasting keywords; the judge penalises buzz only mildly. Proposed: require headline-level checks (buyer, pain, outcome in the first 40 words), count CTAs, detect pricing.
- (c) Website factor 0.3-1.7x vs research 3-4x: trim to ~0.45-1.6x.
- (d) Panel `missing[]` list (pricing, proof, CTA) is decent coaching.
- (e) `market.test.js`.
- (f) **partial**. Fixes: per-source landing conversion in Analytics; page edit history with "one change at a time" credit; trim spread.
- Consequence: realistic, partly traceable.

**Lifecycle and activation (insights.js, insights/model.js, customers.js)**
- (a) `activationRate({fit, onboarding, ttvDays})` (`insights/model.js:15`) and `featureAdoption` (`:23`): activation is entirely a model output of product fit x onboarding mode. The player cannot define the activation event, write onboarding emails, trigger on behaviour or segment signups.
- (b) Not gameable because not player-controlled; the problem is the opposite.
- (c) No spread by lifecycle skill.
- (d) None. (e) `helpdesk.test.js:113` tests the model, not tiers.
- (f) **weak**. Fix: add an "Onboarding emails" editor in Customers or Mail: player defines the activation event from a list of observed behaviours (insights), writes 3-6 emails, chooses triggers; judge (one action per email, specific next step) plus whether the chosen event actually predicts retention (`splitRetention`, `insights/model.js:31`) scales activation by +10-20 points per quarter for a well-chosen event with behaviour triggers, and 0 to -3 for blasts to non-activated users (unsubscribe/complaints).
- Consequence: none.

### 3.4 Product, support, insights (`product.js`, `research.js`, `customers.js`, `helpdesk.js`, `insights.js`, `analytics.js`, `product/`, `support/`, `insights/`)

**Customer discovery (research.js, product/interview.js)**
- (a) Booked on the calendar, live chat with hidden facts released only for past-specific questions (`interview.js:31-110`), `gradeTranscript` (`:112`), `extractFromNotes` (`:167`) for real interviews logged by the player; AI persona rehearsal never counts as evidence; claimed interviews checked against logged (`product/spec.js:152`).
- (b) Strong: facts are hidden state; follow-up consistency needed; commitments listed.
- (c) Spreads in `interview.js` (`PAIN_REAL_SHARE` 0.55, `RECRUIT` rates) are [design], consistent with o3.
- (d) Rehearsal feedback; good.
- (e) `product.test.js:189,326` (good vs pitchy; gaming caught). Binary.
- (f) **strong**. Fix: tier fixtures (4 transcripts) asserting commitments secured 0 / 5-15 / 15-30 / 30-50%; "warm network only" interviews (the `warmPool`, `research.js:30`) flagged in the evidence weight.
- Consequence: realistic.

**Product prioritisation and specs (product.js, product/spec.js, product/fit.js, product/store.js)**
- (a) Spec form: user, problem, solution, acceptance, metric, baseline, non-goals, evidence; instant genericity blocker (`spec.js:130-180`), rubric grader, effort estimate, AI cost, third-party gates, build queue; hidden `trueFit` from shipped features (`fit.js:23-65`): relevance (ICP tokens) x capability (automates vs displays, workaround, trigger, named tool) x (0.9 + 0.1 spec grade).
- (b) Spec lint blocks generic and stuffed text (`isStuffed`, `verbObjectHits`, `spec.js:94-110`); but the true value uses regexes `AUTOMATE/DISPLAY/WORKAROUND/TOOLS` (`fit.js:14-20`) that a player who has read the code can satisfy. Real evidence has a small weight (+0.2 relevance, `fit.js:29`; spec grade only 10%).
- (c) `FIT.perFeature` 0.35 with diminishing returns; research: stellar 40-60% of features move the metric vs mediocre <10% [design]. The game has no per-feature "moved its metric" measure at all.
- (d) Spec reviewer gives specific rewrite hints; no post-ship "did it move the metric you wrote?" feedback.
- (e) `product.test.js` covers lint and fit; no tier test.
- (f) **partial**. Fixes: (1) after a feature has `daysLive >= 30`, compute adoption and the spec metric movement (`insights/model.js:23`) and show "target X, got Y" with a kill/keep decision logged in a decisions log; (2) increase evidence weight: relevance multiplier `0.6 + 0.4 x realEvidenceStrength` where strength comes from linked real interviews and commitments; (3) rebuild tax for killed features (register), (4) tier test with four spec-and-evidence profiles.
- Consequence: too small for unvalidated features; no cost for feature count.

**AI coding agents (product.js, product/build.js, people/capacity.js)**
- (a) Velocity multiplier by codebase maturity (`people/capacity.js`), `debtFactor` (velocity halves at 120 open bug hours, `build.js:48`), rework 15% (`build.js:17`), unreviewed adds 0.2 only when `people.aiReview === false` (`capacity.js:57-61`), founder build sessions cap 10h/day with 0.85 focus beyond 6h.
- (b) The "review" decision is a global toggle, not tied to actual behaviour.
- (c) METR/Faros-type effects (rework 15% vs +20% unreviewed) are far narrower than the research spread (mediocre incident rates +243% per PR in one vendor study; contested).
- (d) None. (e) `product.test.js:130`.
- (f) **weak**. Fixes: per build session choices (spec first with acceptance tests, diff size slider via effort split, review depth, refactor session) that set `reworkShare` 0.15 / 0.2 / 0.3 / 0.5 and incident probability (`insights/model.js:65` `opsRates` bug hours); mediocre ships 20-30% faster for 3-4 weeks then falls behind through `debtFactor`.
- Consequence: none today.

**Analytics, experiments, PMF (analytics.js, insights.js, money/metrics.js, outcomes/engine.js)**
- (a) Weekly flags (`money/metrics.js:274`), cohorts, MRR movements, CAC by channel, funnel builder; **no experiment log, no stop rule, no Sean Ellis survey**. `outcomes/engine.js:314` counts `customers.surveys` (exit surveys) plus `insights.pmf.responses` (a slice that nothing writes) as `pmf_measurement`, so the habit fills passively from cancellations.
- (b) n/a.
- (c) No spread.
- (d) Metric flags are good but do not coach decisions.
- (e) none. (f) **missing**. Fixes: (1) PMF survey to activated users only (core action reached), responses drawn from the hidden satisfaction model, threshold 40% "very disappointed" [Ellis, secondary]; surveying non-activated users returns dilution; (2) general experiment object (hypothesis, metric, sample floor, stop date, outcome) used by Pricing A/B and a new onboarding/landing test; peeking returns false winners at a rate computed from the hidden effect; (3) fix the habit to read the survey slice only.
- Consequence: none (premature scaling on spike is not simulated).

**Support (helpdesk.js, support/model.js, support/tickets.js, people/support.js)**
- (a) Ticket volume by model/accounts/trials/release week/outage, SLA tiers, macros, help articles judged for quality (`support/model.js:38`), AI resolution share `lerp(y1, mature, months) by docs quality` (`:43`), AI-ineligible categories (`:49`), 8% wrong AI answers return as angry tickets (`helpdesk.js:168-170`), FRT to churn (`:65`), CSAT from FRT and resolution (`:79`), reviews and fake-review risk.
- (b) `replyQuality` (`support/model.js:154`) rewards "fixed|shipped|refunded", "step", "today", "sorry" and a question mark: a reply made of those words scores well offline. Require that the reply references facts from the ticket and account.
- (c) FRT tiers and AI 30-70% resolution follow o3; wrong-answer rate fixed.
- (d) Good ticket-level outcome; coaching on weekly worst-ticket review and ticket themes is absent.
- (e) `helpdesk.test.js:41,59,86,156`. No tier test.
- (f) **partial**. Fixes: AI agent config (scope, handoff rule, test on N past tickets) driving resolution share and wrong-answer rate; "worst 20 tickets" weekly review; repeat-contact-within-48h metric; keyword-proof `replyQuality`.
- Consequence: realistic (churn through FRT), traceable (CSAT log).

**Insights / ops (insights.js, insights/model.js)**
- (a) Incident draws with protections (`opsRates`, `:65`), card-testing, leaked keys; paging; status page.
- (b) Protections are toggles bought with hours/money.
- (c) Rates from `data/world.js`. (d) Incident post-mortem text. (e) `helpdesk.test.js:123,137`.
- (f) **partial**. Fix: operator readout (protection coverage vs incident loss).

### 3.5 Money, books, bank, Stripe (`bank.js`, `books.js`, `stripe.js`, `financing.js`, `money/`, `core/bank.js`, `core/stripe.js`)

**Books and close (books.js, money/ledger.js, money/compliance.js)**
- (a) Truth ledger vs the books the player produces (`ledger.js:427-458`), DIY guesses ~10% wrong (`CONFUSE`, `ledger.js:125-139`), review queue, accruals and prepaid adjustments, deferred revenue roll-forward (`:566`), tie-outs to bank and Stripe (`:536`, `:711`), close checklist with hours by bookkeeping service (`:579-630`), compliance calendar with penalties (`compliance.js:121-310`), CPA quote and filing (`:184-221`), nexus, VAT.
- (b) Hard to game: tie-outs fail if wrong.
- (c) Close time by service factor (`service(state).closeFactor`); research 3-5 days stellar vs 10+ bottom quartile; fine.
- (d) Notifications on penalties; "Metrics pack" step.
- (e) `money.test.js` (franchise tax, ledger).
- (f) **strong**. Fix: a "books quality" readout (misclassified share, months unclosed, filings on time) mapped to a tier and shown on the Scorecard.
- Consequence: realistic and traceable.

**Bank and runway (bank.js, money/common.js)**
- (a) `runwayWithDebt` (`common.js:140`), recurring bills, treasury sweep, declined bills; `weeklyFlags` raise warnings at runway <6 / <12 months (`metrics.js:277`).
- (b) n/a (derived).
- (c) None; research [design]: stellar raises at 9+ months; the game does not use runway in the raise.
- (d) Flags only. (e) none.
- (f) **weak**. Fix: 13-week cash forecast object (payroll, payouts, annual prepays, tax dates) with 3 scenarios and a stored cut trigger; score forecast error against actual bank balance (stellar +-10%, average +-25%, mediocre +-40%); runway-linked fundraising leverage (see 3.7).
- Consequence: none beyond running out of cash.

**Payments and dunning (stripe.js, core/stripe.js, money/metrics.js)**
- (a) Smart Retries, dunning emails, card updater, merchant of record, Stripe Tax, disputes with evidence judged (`money/judge.js:21`), instant payouts, invoices/AR, recovery stats (`metrics.js:251`).
- (b) Evidence judge is keyword heuristic offline (`judge.js:21-45`, 40-word floor): stuffable; tie to the facts on record (already `facts`) and require specifics (dates, usage).
- (c) `PAYMENTS.retrySuccess` x `smartRetryBoost` x 1.25 for emails (`core/stripe.js:282`). Recovery default is already stellar-ish; research median ~47.6%, best 70-85%.
- (d) Recovery card and flag at < 40% (`metrics.js:287`).
- (e) `money-core.test.js` covers fees and refunds.
- (f) **weak** for dunning. Fixes: defaults off, sequence designer (steps x timing x copy judged), decline-code view; recovery 35-45% default, 70-85% with designed sequence and card updater; involuntary share of churn visible in the MRR bridge (exists in `metrics.js:111`).
- Consequence: none for the default player.

**Financing (financing.js, core/personal.js, core/debt.js, data/lenders.js)**
- (a) Real underwriting by credit profile; personal guarantee, cards, HELOC, 401(k), ROBS, SBA; job search/quit decision.
- (b) Hard to game: underwriting rules by credit.
- (c) Rates from research. (d) Offers explained. (e) `core.test.js` covers parts.
- (f) **partial**. Fix: "worst-case outcome" disclosure before taking personal-guarantee debt and a debrief when it bites.
- Consequence: realistic.

### 3.6 People, legal, company (`people.js`, `legal.js`, `people/`, `legal/`)

**Hiring (people.js, people/hiring.js, people/candidates.js, people/interview.js, people/assess.js, people/sourcing.js)**
- (a) Job post judged (`hiring.js:11`, `postQuality`), channel fit and flow (job boards flood with AI applications, `sourcing.js:17-18`; referrals few but better, `company.test.js:624`), resume screen noise, live interview with graded question types (`interview.js:44` probe 0.95 ... leading 0.2), scorecard raises evidence quality (`interview.js:148`), assessments/work samples (`assess.js:39`), reference checks, offer acceptance (`hiring.js:79`), agency fees and guarantee.
- (b) Strong: observations are noisy draws of hidden traits; talkers vs doers fraud modelled (`candidates.js:149`).
- (c) Validity ordering structured > work sample > unstructured matches o4; absolute coefficients live in the evidence noise.
- (d) Candidate summaries; no explicit "you hired without a scorecard".
- (e) `company.test.js:624,638`.
- (f) **strong**. Fixes: hire provenance record (scorecard, structured, work sample, references, days to offer) stored on the member; shown with the monthly read and at exit; tier test with four loops over the same 40 candidates asserting hire composite and 12-month retention ordering.
- Consequence: realistic; traceability partial.

**People management (people/performance.js, people/sim.js)**
- (a) Productivity from hidden traits; management hours fixed by role (`performance.js:33`); morale target = pay vs market + equity + energy + runway (`sim.js:688-696`); attrition `BASE x 2^((60-morale)/15)` (`:791`); PIP (`:380`); misclassification risk (`:548`, `:747`, `:770`, `:798`).
- (b) Nothing the manager writes or does changes morale.
- (c) Gallup 2.7x engagement for weekly feedback not represented.
- (d) PIP outcome notes. (e) none.
- (f) **weak**. Fixes: per-member 30/60/90 plan (3 measurable outcomes before day 1), weekly 1:1 agenda (hours already charged: tie quality to a short agenda text), written feedback and performance conversations (dated example plus expected change by date); effect on morale target (+5 to +10), ramp (`rampFactor`) and attrition; firing without documentation raises dispute probability; test: four management routines over a 6-person team, 12 months, attrition 0.6x / 0.85x / 1x / 2x.
- Consequence: none except misclassification (realistic).

**Legal (legal.js, legal/sim.js, legal/catalog.js, legal/deadlines.js, legal/redlines.js)**
- (a) Entity and provider choice, founder stock with 83(b) deadline (`sim.js:102`), IP assignment/CIIAA, policies, DPA, GDPR requests with deadlines (`:553`), SOC 2 programme, trademark office actions (`:504`), contract redlines with deal probability and legal exposure (`:305-317`), `legalIssues` (`:391`) gating fundraising diligence.
- (b) Strong: dates and documents are state.
- (c) Costs from catalog; penalty paths realistic.
- (d) Notifications; no debrief on cost of skipped items.
- (e) `company.test.js:351` (franchise tax) and others.
- (f) **strong**. Fix: a "legal hygiene" readout (open red flags, days late) on the Scorecard; add the dollar estimate to 83(b) missed.
- Consequence: realistic and traceable.

**Co-founder (cofounder.js, cofounder/sim.js, cofounder/model.js)**
- (a) Profile quality judged, candidate pool conditioned on ICP, invite acceptance (`model.js:76`), calls on the calendar, trial projects with check-ins (`model.js:105`), equity expectation vs offer (`:84-100`), vesting and 83(b) (`cofounder.js:162`), breakup hazard (`:112`).
- (b) Trial check-ins cost hours (`TRIAL_FORCED_HOURS`); you cannot skip diligence.
- (c) Parameters from `data/world.js` COFOUNDER.
- (d) Candidate concerns. (e) none specific.
- (f) **partial**. Fix: trial-skipped signing raises breakup hazard (`model.js:112` `trialDone` exists: verify weight) and shows the hazard with a coaching line.
- Consequence: realistic.

### 3.7 Fundraising and capital (`fundraising.js`, `fundraising/`, `financing.js`)

**Fundraising (fundraising/sim.js, outcomes.js, rubric.js, investors.js, view-*.js)**
- (a) Founder profile, LinkedIn, bio, deck uploaded and judged on a rubric (`rubric.js`), investor archetypes with thesis, stage and check-size fit (`outcomes.js:73`), warm vs cold channel and intro blurb quality (`sim.js:429`), follow-up decay `[1, .5, .35, .25]` (`outcomes.js:104`), raise time box and stale penalty x0.7 (`sim.js:146`, `outcomes.js:111`), too-soon penalty, competing leads lift terms (`sim.js:207`), cap pushback (`:222`), diligence blockers include legal issues (`:396`), no-shows and reschedules lower reputation (`sim.js:541`, `view-crm.js:317`).
- (b) Strong: `F7` test for keyword stuffing and injection (`fundraising.test.js:427`); sanitisation (`rubric.js:163`); hard gates.
- (c) `fundraising.test.js:488`: credible founder with LOIs raises >= $250k 20-65%, median <= 20%, weak <= 5% over 30 seeds. This is the best existing tier-like test in the repo. Matches the o5 spread qualitatively.
- (d) Rubric feedback + pass reasons (`sim.js:187`).
- (e) Present (above); covers three profiles but not behaviours (warm vs cold, parallel vs serial, runway).
- (f) **strong**. Fixes: (1) runway leverage (register), (2) market-talk penalty for spray (register), (3) a behaviour-tier test: same company, four raise behaviours (target 40 + warm + parallel; cold 100; serial; first term sheet), assert close odds and cap spread 1.0 / 0.8 / 0.5 / 0.3.
- Consequence: realistic; spray and low-runway raises too small/none.

**Investor relations (fundraising/ir.js, view-ir.js)**
- (a) Update judged on candor, clarity, asks specificity, accuracy (`ir.js:36-67`), warmth variable, hidden-bad-news penalty at a raise (`:226-231`), board meetings with prep, advisors with vesting.
- (b) Accuracy is checked against metrics; asks become real leads only if specific (`fulfillAsk`, `:123`).
- (c) Cadence effect on warmth; research has no outcome numbers beyond Visible's cadence stats.
- (d) Judge feedback. (e) `fundraising.test.js:297`.
- (f) **strong**. Fix: monthly-cadence streak and stable metric definitions as warmth inputs.
- Consequence: realistic and traceable.

### 3.8 Network, calendar, mail, you, home, settings, outcomes

**Calendar / Mail / Messages (calendar.js, mail.js, messages.js, core/network.js, core/calendar.js, core/mail.js)**
- (a) Every reply costs 0.1-0.5 h (`mail.js` `Math.min(0.5, 0.1 + words/400)`), engaged threads progress only after real replies (>= 12 words, `messages.js:151`), outcomes resolve after 2 engagements (`:159`), declined inbound is free and keeps reputation, intro asks have connector fatigue (`network.js:241`).
- (b) Hours bound volume; "one-word replies don't count" blocks gaming.
- (c) Archetype mix from research; scams and waste exist.
- (d) Result lines only. (e) `core.test.js:110`.
- (f) **partial**. Fixes: pay-to-play decision with a real loss; weekly "where did your hours go" read compared with stated top-3 priorities (user sets them in `home.js`); focus-block benefit (register).
- Consequence: too small for time-wasting (hours only).

**You / Home / Settings (you.js, home.js, settings.js, core/wellbeing.js)**
- (a) Energy, life events with responses, habits; Home goals and next actions; Settings: AI judge models and offline mode.
- (b) n/a. (c) 54% burnout (Sifted) and 60h+ risk are used.
- (d) Burnout warning on Scorecard. (e) `outcomes.test.js:35`.
- (f) **partial**. Fixes: kill-criteria record (set before a bet, reviewed on a date) in Home; check against MRR/runway; "days past criterion" on the Scorecard; pivot-frequency counter from ICP/plan changes versus logged interviews.
- Consequence: realistic for burnout; none for drift.

**Scorecard (outcomes.js, outcomes/engine.js)**
- (a) Eight habits (customer contact >= 5/wk, releases weekly, 4 launches/yr, 3 posts/wk, charge within 30 days, concierge onboardings, 40 survey responses, 12 months runway) and failure-mode warnings (`engine.js:300-345`); surface-area luck from `activity()` (`:49`).
- (b) **Count-based**: posts, outbound touches, content pieces, survey rows, releases are counted without quality; `launchesPerYear` counts public events. Re-publish a trivial bug fix each week to meet `ship_fast`.
- (c) Luck multipliers from `data/outcomes.js` (sourced to RevenueCat, ChartMogul, Carta).
- (d) Each habit has `why`; no stellar behaviour readout per function. This is where the per-function tier read-out belongs (see 5.1).
- (e) `outcomes.test.js:17,28,35` (surface area, diminishing returns, habits reflect behaviour); no tier test.
- (f) **partial**. Fixes: quality-weighted activity, remove passive habit sources (exit surveys), and add the per-function tier panel.

---

## 4. Top 15 fixes (free mistakes first)

Ordered by impact, free mistakes ahead of calibration. Owning area in brackets. "Effect" is the target gap the change must produce.

1. **Dunning/billing defaults are stellar (ignoring failed payments is free)** [money: `core/stripe.js:280-282`, `stripe.js` Billing settings, `money/metrics.js:251`]. Default to one plain email and a default retry; add a player-authored sequence (steps, timing, copy judged, card-update link) and decline-code view. Effect: recovery 35-45% default, 70-85% designed (Recurly/Yuno), involuntary share of churn 20% vs 45%. Test: four sequences over a 1,000-subscription cohort.
2. **Hiring provenance and consequence** [people: `people/sim.js` hire step, `people/performance.js`]. Store scorecard/work sample/references/days-to-offer on each member; show them in the monthly read and exit; make unstructured+no references yield a wider hidden-trait error and 12-month replacement 40-60% vs 5-10%. Test: four loops over the same candidate pool.
3. **People management has no inputs** [people: `people/sim.js:688-696`, `performance.js`]. Add 30/60/90, weekly 1:1 agenda, written feedback, performance conversation timing as morale/ramp/attrition inputs. Effect: attrition 0.6x vs 2x, engagement 2.7x for weekly feedback (Gallup, secondary).
4. **Spamming outreach and investors has no market cost** [sales: `sales/engine.js:74`, `sales/deliverability.js`; fundraising: `fundraising/sim.js:114`]. Add suppressed/burned prospect pool and brand cost for repeated or spam-marked contacts; investor market-talk penalty for repeated passes. Effect: spam blast of 2,000 lowers next campaign reply rate by 30-50% for 60 days.
5. **Shipping unvalidated features and going in circles** [product: `product/fit.js:23-65`, `product.js`]. Weight relevance by real evidence strength; post-ship metric check at 30 days ("target X, got Y"); decisions log; rebuild tax (+25% effort when a killed feature is rebuilt within 90 days). Effect: share of features moving their metric 40-60% / 15-25% / <10% (o3 [design]).
6. **No PMF survey, no experiment discipline; Scorecard `pmf_measurement` is passive** [product/insights: `insights.js`, `outcomes/engine.js:314`]. Add Sean Ellis survey to activated users only, experiment object with stop rule, peeking returns false winners. Effect: premature-scaling consequence when PMF is called from a launch spike.
7. **Raise with low runway has no leverage cost; no cash forecast** [money/fundraising: `bank.js:86`, `fundraising/sim.js`]. 13-week forecast with scenarios and a stored trigger; terms and close odds scale with runway at start; forecast error scored (+-10 / 25 / 40%). Effect: raise at <4 months runway lowers cap odds ~25% and forces first term sheet.
8. **AI coding and automation have one toggle each** [product/people: `people/capacity.js:57`, `helpdesk.js:41`, `sales/engine.js:165`]. Per session review/tests/diff choices; AI support scope + handoff; AI SDR review step with caught/uncaught hallucination. Effect: rework 0.15 vs 0.3-0.8; 1 customer/deal lost per quarter for unreviewed customer-facing output [design].
9. **Scorecard luck counts volume, not quality** [outcomes: `outcomes/engine.js:49-82`, `:300-330`]. Weight posts, touches, content by judged quality and reply-gated sends; remove exit surveys as a habit source.
10. **Per-function operator signals and tier read-out** [core + Scorecard: new `core/operator.js` and `outcomes.js`]. See 5.1.
11. **Lifecycle/activation is a model output** [product/insights: `insights/model.js:15`]. Onboarding sequence editor, activation-event choice validated against retention, behaviour triggers. Effect: +10-20 activation points/quarter for a good flow, 0 to -3 for blasts.
12. **Customer success timing and success plans** [success: `success/engine.js:165`, `model.js:53,65`]. Player-started early renewal (+5-8 acceptance points), success-metric plan as a health input, trim the churn multiplier to 0.6-1.8, NRR/GRR tier read-out.
13. **Offline judges are keyword-stuffable** [sales/support/website/product: `support/model.js:154`, `sales/scorecard.js:29`, `website.js:56`, `money/judge.js:21`, `product/fit.js:14-20`]. Add per-recipient uniqueness, reference-the-previous-answer checks, ticket-fact references, headline-position checks; keep the LLM as the primary judge and the heuristic as a conservative fallback (shrink toward the median, as `effectiveSkill` does for ads).
14. **Founder time: focus blocks, scam engagement, priorities** [network/calendar: `core/calendar.js:109`, `messages.js:91`]. Maker-hour multiplier on deep work, stored weekly top-3 vs actual time, pay-to-play decision with a real loss, kill-criteria record.
15. **Tier separation tests and ICP/website/partner calibration** [all: `test/operators.test.js`, `sales/segments.js`, `core/market.js:42`]. ICP quality as a positive-reply multiplier (2-3x stellar vs broad), trim website spread to ~3.5x, partner-fit scoring, and the cross-function tier test harness in 5.3.

Group view (same fixes by owning area):

- **core**: 10 (operator helper), 14 (focus blocks), 15 (website spread, test harness).
- **sales/success**: 4 (outreach burn), 12 (success timing/plans), 13 (scorecard follow-up detector), 15 (ICP multiplier).
- **growth/marketing/channels/pricing**: 9 (quality-weighted activity), 11 (lifecycle, shared with insights), 15 (partner fit), launch sequencing credit, frequency decay, retargeting incrementality, targetCpa required.
- **product/support/insights**: 5, 6, 8 (AI coding, AI support scope), 11, 13 (reply quality).
- **money/books/bank/stripe**: 1, 7 (forecast), dispute evidence judge hardening, books quality tier.
- **people/legal**: 2, 3, plus legal readout and 83(b) dollar line.
- **fundraising/cofounder**: 4 (investor spray), 7 (runway leverage), behaviour-tier raise test, cadence streak, trial-skip hazard.
- **network/calendar/mail/you/home**: 14 (focus blocks, scam, kill criteria), weekly priorities vs time.

---

## 5. Cross-cutting recommendations

### 5.1 Shared "operator signals" helper and Scorecard read-out
Add `public/core/operator.js` (pure, no DOM) exporting `operatorSignals(state)` which returns, per function id in `public/data/operator-tiers.js`, `{ id, label, tier: 'stellar|good|average|mediocre|unknown', score 0..1, signals: [{ metric, value, tierThresholds, source: 'sourced|design' }], coaching: [string], costs: [{ mistake, estimatedCost, since }] }`. Rules:
- Each owner registers a reader in its own module (`operatorReader(state)`), so the owner keeps its code: for example `sales` reads reply rate per 100 sends, ICP filter count, bounce %, questions per call, talk share; `growth` reads CPA ceiling set, edits per ad set, creatives tested; `money` reads months unclosed, filings late, recovery %.
- Unknown until the player has acted (no data: `unknown`, never `mediocre`), and tier is computed from observed actions in the last 90 days, never from difficulty settings.
- Coaching comes from `OPERATOR_TIERS[fn].traps[].coaching`, selected by which trap `id` the reader detected; the stellar behaviour line comes from `tiers.stellar.behaviours`.
- Mark every shown number with `sourced` / `[design]` from `metrics[id].sourced`; design numbers render with a "game estimate" badge (ARCHITECTURE principle 3).
- `public/apps/outcomes.js` (Scorecard) gets a third panel "Operator quality by function": one row per function that has data, tier badge, 1-line "what a stellar operator would do" and "what this has cost you". `core/operator.js` imports the registry's readers lazily to avoid app-to-app imports.

### 5.2 Consequence ledger
Add `state.mistakes[]` (`{day, fn, trap, estCost, text}`) written by owners when a trap fires (83(b) missed, grandfathering skipped, test adopted early, hire without scorecard, AI output unreviewed, domain burnt). Surface in Scorecard ("What mistakes cost you") and in the monthly summary. This answers the addendum's traceability column across all functions and makes "going in circles" visible (rebuilds, re-launches, re-hires get a count).

### 5.3 Test harness for tier separation
Add `test/operators.test.js` using `OPERATOR_TIERS` and a small `archetypePlayer(fn, tier)` fixture per function (inputs only: the text, settings and decisions a player of that tier would produce, taken from `tiers[tier].behaviours`). For each function assert:
1. ordering `stellar > good > average > mediocre` on the function's primary outcome over >= 30 seeds,
2. gap sizes within the sourced or [design] ranges (`tiers[*].outcomes`, with tolerance), flagging design-only gaps as soft,
3. a gaming fixture: keyword-stuffed or volume-inflated input does not beat the honest good tier,
4. a coaching assertion: the mediocre fixture yields at least one `traps[].coaching` string.
Functions with existing near-tests to extend rather than rewrite: cold outreach (`sales.test.js:178,314,340`), ads (`growth.test.js:77,387`), fundraising (`fundraising.test.js:488`), discovery (`product.test.js:189`, `sales.test.js:223`), hiring (`company.test.js:624`).

### 5.4 Defaults and offline fallbacks
- No default setting may equal a stellar choice (dunning, Smart Retries, Mercury treasury, SOC 2 timing). Default = what a typical processor or tool ships with.
- Offline heuristic judges must shrink toward the median (as `effectiveSkill`, `growth/adsEngine.js:122`) so stuffing cannot reach stellar offline; use a common `shrink(skill, mock)` helper in `core/llm.js` for all judges (sales copy, website, posts, replies, specs).

### 5.5 Calibration reminders
- Spreads to trim: website factor (5.7x to ~3.5x), CS churn multiplier (6x to 3x), concierge conversion (2.2x, keep but charge hours).
- Spreads to add: ICP quality (2-3x), people-management attrition (0.6-2x), runway leverage on terms, activation by flow (10-20 points).
- Source discipline: o1-o5 flag many numbers `[unverified]` or `[design]`. In UI and docs show them as game estimates; `public/data/operator-tiers.js` carries `sourced` and `confidence` per metric.

---

## Appendix: app to function map

| App | Functions it implements |
|---|---|
| crm, outreach, calls | prospecting, cold_outreach, discovery_demo, deal_management |
| success, customers | customer_success, lifecycle_activation |
| ads | paid_ads |
| organic | content_seo_geo, launch_community_referral |
| channels | partnerships_channels, launch_community_referral |
| pricing, stripe (products) | pricing_packaging |
| website, market | positioning_landing, partnerships_channels (competition) |
| research, product | customer_discovery, product_prioritization, ai_building |
| insights, analytics | lifecycle_activation, analytics_pmf, cash_runway (flags) |
| helpdesk | support, automation_ai |
| bank, books, financing | cash_runway, bookkeeping_close_tax, founder_sustainability |
| stripe | payments_dunning |
| people | hiring, people_management, automation_ai |
| legal, cofounder | legal_hygiene, hiring (co-founder) |
| fundraising | fundraising, investor_relations |
| calendar, mail, messages, you, home, settings, outcomes | founder_time, founder_sustainability, Scorecard read-out |
