# Outcome calibration: average, elite and mistakes founders vs OUTCOME_TARGETS

Measured on 2026-10-14. Final numbers come from commit `30fb8dc`, with this pass's uncommitted luck-layer edits in `public/apps/outcomes/engine.js`. Another agent's WIP commits have since picked up those edits. Other agents edited sales, money and segments files while the grid ran. Each run loads modules when it starts, so a few later chunks may have loaded slightly newer sales code. The baseline was measured at `e3ea0e2`.

Harness: `docs/review/calibration/` (`lib.mjs`, `sales.mjs` copied from the e2e bots and extended, `run-cell.mjs`, `run.sh`, `analyze.mjs`). Reproduce with `./run.sh 60 1095 10 "b2c smb" "indie vc"` (about 18 min on 4 cores), then run `node analyze.mjs out/*.json`. Raw reports: `final/report.md` (after the fixes), `base/report.md` (before), `exp-latent/report.md` (latent-demand experiment). Each cell has 60 seeds × 36 months. Judges run offline, with no API key.

## Method

- **Bots** drive the real app modules: product specs, grading and build; Research `bookReal` plus a replica of the notes logger; Customers onboarding (calls held); Organic network launch, posts, community, SEO and Product Hunt; Meta and Google ads; the sales outbound sequence, calls, inbox, proposals and inbound triage; People contractor hiring through Deel and Upwork; Legal incorporation; Fundraising raise, outreach and pitches; AI coding seats. Every action spends founder hours at the UI's price, and calendar meetings are charged by the calendar. No state is mutated except through these functions or line-for-line replicas of UI handlers (marked in the code).
- **Common setup**: 55 h/week, $30k company cash, $20k personal savings, $3.8k/month living costs plus debt, quit the day job. Founder pay is the same for every policy: indie founders take half of MRR, up to living costs, once MRR passes $1k; VC founders take a salary after raising at least $150k (elite $4.5k, average $6k, mistakes $9k).
- **Quit rule** (the harness defines it; the game has no "give up"): from month 12, a founder whose MRR was below $200 at each of the last 6 month-ends quits. The bot then stops acting and lets contractors and ads go. **Dead** means the game's own shutdown: the bank account was overdrawn for 14 days.
- **Policies**:
  - **average**: list price at the model default ($9.99 / $49); a broad ICP; ships about one spec a month; 1.5 real interviews a week; one network launch at MVP; a LinkedIn post every two weeks. B2C runs Meta ads at $30/day with average copy. SMB runs outbound at 3 prospects/day with mixed call skill. VC raises at MVP and hires one contractor engineer once it has $250k.
  - **elite**: price above the median ($12.99 / $79), 7-day card-required trial, narrow ICP; Claude Max-class coding seat; specs that cite and link real interview evidence, shipped as fast as possible; 5–6 customer conversations a week (interviews plus sales calls); network launch at first ship; Product Hunt 45 days later; one community post a week; an SEO article every two weeks; 3 build-in-public posts a week; concierge onboarding (B2C: kickoff call) until 20 calls are held or trial volume gets too high. B2C ads start only 60 days after launch at $20/day, and the budget scales only while CAC is under 4× the monthly price. Ads pause below $8k cash. SMB outbound runs at 3 prospects/day with good calls. VC raises after reaching $1k MRR (or at month 6 with an MVP) and hires only at $5k MRR.
  - **mistakes**: builds for 6 months with no conversations, posts or launch; price about 0.3× the median ($2.99 / $15); no card required; ICP is "everyone". At month 6 it launches, starts ads at $100/day with no retention check, hires two Upwork contractors (an engineer and a marketer, 30 h/week each), interviews one person every two weeks, and on VC raises $750k then pays a $9k salary.
- Enterprise was not run. The ent deal flow needs committee mapping, paperwork and segment gates (`apps/sales/engine.js` dealsDay, segmentGate) that this harness does not drive. A 300-day elite ent probe produced 5 proposals and 0 wins.

## Summary

1. **Distribution is too narrow on both ends.** Average founders almost all earn a little: 100% of B2C and 68% of SMB have revenue by month 12 (target 35–60%). Almost nobody earns a lot: 0% reach $10k MRR by month 24 in every average and B2C cell (target 3–6%), and B2C p95 MRR at 24 months is $649 (target $6–12k). MRR across seeds spreads only about 3–10× from p50 to p95. The research spread is about 90× (TrustMRR p95/p50).
2. **Before the fixes, the only right tail was an artifact.** One luck burst converted at full trial rates. One Hacker News front page gave 342 trials, 208 paying SMB customers and +$10.5k MRR in a month (indie-smb-average seed 6). A vc-smb-elite run got 873 paying customers from 3 HN hits. That is now fixed (below), so the honest tail is close to zero.
3. **Elite play separates in SMB but not in B2C.** SMB elite median MRR at 24 months is 10–15× average (target 3–10×), with p90 3.3–4.6× (in range). Elite SMB is still under $10k at 24 months in 97–98% of runs (target 30–50%). B2C elite earns *less* than average (0.46×), because B2C MRR in the game is bought with paid ads at ROAS < 1, and elite behaviours have no B2C lever.
4. **Mistakes fail 97–100%** (target ≥80%), but almost always the same way: the bank account runs dry around month 9.5 after two contractors and $100/day of ads. Several of the mistakes themselves cost nothing (see "Free mistakes").
5. **Luck is now surface-area driven and modest.** Elite gets about 1.3–2× the positive draws of average (viral posts, investor inbound, Product Hunt top 3, HN). Mistakes get about a fifth. No single luck event can create a business any more.

## Average policy vs OUTCOME_TARGETS (final, n = 60 per cell)

| cell | metric | target | measured | in/out |
|---|---|---|---|---|
| indie b2c | pctAnyRevenueBy12mo | 35–60% | 100% | HIGH |
| indie b2c | pctReach1kMrrBy12mo | 10–15% | 1.7% | LOW |
| indie b2c | pctReach1kMrrBy24mo | 17–19% | 6.7% | LOW |
| indie b2c | pctReach10kMrrBy12mo | 2–3.5% | 0% | LOW |
| indie b2c | pctReach10kMrrBy24mo | 4.6–5.3% | 0% | LOW |
| indie b2c | pctReach100kMrrBy36mo | 0.3–0.8% | 0% | LOW |
| indie b2c | medianMrrAt12mo | $50–100 | $280 | HIGH |
| indie b2c | bottomQuartileMrrAt12mo | $0–19 | $180 | HIGH |
| indie b2c | p95MrrAt24mo | $6–12k | $649 | LOW |
| indie b2c | medianDaysTo1kIfReached | 45–90 | 377 | HIGH |
| indie b2c | pctStillActiveAt36mo | 25–45% | 30% | in |
| indie smb | pctAnyRevenueBy12mo | 40–60% | 68% | HIGH |
| indie smb | pctFirstCustomerWithin30dOfLaunch | 15–25% | 33% | HIGH |
| indie smb | pctReach1kMrrBy12mo | 10–18% | 11.7% | in |
| indie smb | pctReach10kMrrBy24mo | 3–6% | 0% | LOW |
| indie smb | pctReach100kMrrBy36mo | 0.2–0.5% | 0% | LOW |
| indie smb | medianMrrAt12moAllStarters | $0–50 | $98 | HIGH |
| indie smb | medianMrrAt24moRevenueEarners | $100–300 | $392 | HIGH |
| indie smb | pctStillActiveAt36mo | 30–50% | 33% | in |
| vc b2c | pctReach1MArrBy24mo | 5–15% | 0% | LOW |
| vc smb | pctReach1MArrBy24mo | 10–25% | 0% | LOW |

Not measurable within 36 months or with this harness: Series A rates, $10M ARR by 60 months, unicorn, acquisition and shutdown by 72 months, annual-plan cancel rate, flat/shrinking share. Only 13–17% of VC bots raised ≥$250k.

## Policy expectations (final)

| cell | metric | target | measured | in/out |
|---|---|---|---|---|
| indie b2c | elite median MRR24 ÷ average | 3–10× | 0.46× ($91 / $200) | LOW |
| indie b2c | elite p90 MRR24 ÷ average | 3–5× | 0.45× | LOW |
| indie b2c | elite share still < $10k at 24 mo | 30–50% | 100% | HIGH |
| indie b2c | elite reach $100k by 36 mo | 1–3% | 0% | LOW |
| indie b2c | mistakes dead or quit by 24 mo | 80–100% | 100% (all dead) | in |
| indie b2c | mistakes reach $10k by 24 mo | 0–1% | 0% | in |
| indie smb | elite median ÷ average | 3–10× | 10.2× ($1,501 / $147) | HIGH (edge) |
| indie smb | elite p90 ÷ average | 3–5× | 3.3× | in |
| indie smb | elite share still < $10k at 24 mo | 30–50% | 98.3% | HIGH |
| indie smb | elite reach $100k by 36 mo | 1–3% | 0% | LOW |
| indie smb | mistakes dead or quit by 24 mo | 80–100% | 100% | in |
| vc b2c | elite median ÷ average | 3–10× | 0.46× | LOW |
| vc b2c | mistakes dead or quit by 24 mo | 80–100% | 98.3% | in |
| vc smb | elite median ÷ average | 3–10× | 14.5× ($1,422 / $98) | HIGH |
| vc smb | elite p90 ÷ average | 3–5× | 4.6× | in |
| vc smb | mistakes dead or quit by 24 mo | 80–100% | 96.7% | in |

Before → after this pass (baseline `e3ea0e2`, 40 seeds): indie-smb elite share still < $10k went from 95% to 98%. indie-smb average p95 MRR24 went from $5,145 to $1,960. The share of average runs reaching $10k went from 2.5% to 0%. Luck-burst customers (HN plus press) per average SMB run went from 29 paid to 6 paid.

## Distributions (final)

| cell | any rev 12 | $1k@24 | $10k@24 | MRR12 p25/p50 | MRR24 p50/p90/p95 | dead/quit by 24 | active 36 | raised>0 / ≥$250k | forced into a job |
|---|---|---|---|---|---|---|---|---|---|
| indie-b2c-average | 100% | 6.7% | 0% | 180/280 | 200/460/649 | 1.7% / 37% | 30% | – | 88% |
| indie-b2c-elite | 100% | 5.0% | 0% | 78/117 | 91/208/286 | 0% / 93% | 5% | – | 98% |
| indie-b2c-mistakes | 100% | 0% | 0% | 0/0 | 0/0/0 | 100% / 0% | 0% | – | 5% |
| indie-smb-average | 68% | 16.7% | 0% | 0/98 | 147/980/1,960 | 1.7% / 57% | 33% | – | 93% |
| indie-smb-elite | 100% | 90% | 1.7% | 711/1,106 | 1,501/3,239/4,898 | 0% / 0% | 100% | – | 75% |
| indie-smb-mistakes | 100% | 1.7% | 0% | 0/0 | 0/0/0 | 100% / 0% | 0% | – | 3% |
| vc-b2c-average | 100% | 3.3% | 0% | 180/250 | 170/500/599 | 5% / 40% | 25% | 43% / 13% | 78% |
| vc-b2c-elite | 100% | 5.0% | 0% | 65/104 | 78/208/260 | 1.7% / 87% | 3% | 37% / 17% | 92% |
| vc-b2c-mistakes | 100% | 0% | 0% | 0/0 | 0/0/0 | 98% / 0% | 0% | 8% / 2% | 3% |
| vc-smb-average | 70% | 15% | 0% | 0/49 | 98/735/1,225 | 0% / 77% | 18% | 42% / 17% | 83% |
| vc-smb-elite | 100% | 80% | 3.3% | 553/869 | 1,422/3,397/6,083 | 0% / 0% | 95% | 43% / 15% | 67% |
| vc-smb-mistakes | 100% | 1.7% | 0% | 0/0 | 0/0/0 | 97% / 0% | 0% | 22% / 3% | 12% |

Mistakes reach "any revenue by 12 months" at 100% because they launch with $100/day of ads at month 6. They still die around month 9.5. In the mistakes cells, "forced into a job" is low only because the company dies first.

## Luck events: mean per run over 36 months (share of runs with ≥1)

| event | indie-b2c avg / elite / mistakes | indie-smb avg / elite / mistakes | vc-smb avg / elite / mistakes |
|---|---|---|---|
| viral_post | 1.03 (57%) / 1.35 (58%) / 0 | 0.55 (32%) / 1.27 (73%) / 0 | 0.42 / 1.02 / 0 |
| creator_mention | 0.43 / 0.40 / 0.25 | 0.42 / 0.57 / 0.03 | 0.28 / 0.57 / 0.10 |
| hn_front_page | 0.07 / 0.08 / 0.03 | 0.10 / 0.18 / 0.02 | 0.07 / 0.07 / 0 |
| product_hunt_top3 | 0.03 / 0.03 / 0 | 0.02 / 0.15 / 0 | 0.02 / 0.05 / 0.02 |
| press_feature | 0.22 / 0.15 / 0.03 | 0.10 / 0.15 / 0.03 | 0.15 / 0.22 / 0.02 |
| investor_inbound | 0.02 / 0.02 / 0 | 0.08 / 0.68 / 0 | 0.10 / 1.22 / 0 |
| whale_inbound | – | 0.10 / 0.23 / 0 | 0.15 / 0.13 / 0.07 |
| acquisition_interest | 0 / 0 / 0 | 0 / 0.02 / 0 | 0 / 0.02 / 0 |
| capability_tailwind | 0.45 / 0.72 / 0.28 | 0.42 / 0.83 / 0.13 | 0.52 / 0.77 / 0.17 |
| category_heat | 0.37 / 0.30 / 0.03 | 0.25 / 0.43 / 0.03 | 0.25 / 0.50 / 0.08 |
| whale_churn (neg.) | 0 | 0.05 / 0.02 / 0 | 0.03 / 0.02 / 0 |
| clone_after_viral (neg.) | 0.03 / 0.05 / 0 | 0 | 0.02 / 0 / 0 |

(`final/report.md` has all 12 cells; vc-b2c matches indie-b2c within noise.) `payment_reserve` never fired. Average B2C gets slightly more press than elite because its ad-driven MRR growth feeds `growthRateMonthly`.

## Elite habits the game can and cannot express (Scorecard at month 6, elite cells)

| habit | met (elite) | note |
|---|---|---|
| customer_contact (≥5/week) | 52–62% | Reached. It falls by month 12 because 75–98% of elite founders are forced into a day job (25 h/week). |
| ship_fast (≥1 release/week) | 80–100% | Now counts bug-fix release days (this pass). Features alone come to 2.7–3.3 a month. |
| many_shots (≥4 launches/year) | **0%** | Not expressible. At most 2 launches exist (network and Product Hunt, each once): `growth/organicEngine.js:62,132`. |
| build_in_public (≥3 posts/week) | 53–77% | |
| charge_early (≤30 days) | 58–80% | |
| unscalable_concierge | 62–67% (SMB), 0% (B2C) | B2C uses kickoff calls. |
| pmf_measurement | 68–85% | Counts customer-panel responses. |
| default_alive | ~100% | |

## Root causes of the misses

| # | miss | root cause (file:line, parameter) | proposed minimal change | owner |
|---|---|---|---|---|
| R1 | Right tail missing in every cell; distribution about 10× too narrow in log space | No hidden per-company demand. Fit, price and conversion are model-level constants (`core/market.js:88-107`, `core/params.js MARKET`), and `trueFit` saturates at 0.95 for any 20+ shipped specs (`apps/product/fit.js:12` FIT.max/perFeature). With the same idea, every seed lands within ±3× of its median. | Add a hidden, seeded `market.latent.demand ~ LogNormal(median 0.5, σ 1.2)` as a `landing` modifier and its square root as a `conversion` modifier. **Measured in a scratch copy** (`exp-latent/report.md`): indie-smb average median MRR12 went $98 → $49 (in range), any revenue 80% → 60% (in range), earners' median MRR24 $245 → $147 (in range). The tail barely moved (p95 MRR24 $2.4k, $10k@24 2.5%), so also scale traffic volume by the same draw: SEO keyword volume (`growth/organicModel.js:17 keywordMetrics`), social reach, and WOM K (`organicModel.js:138`, cap K at 0.6 when demand > 2). | core (market), growth |
| R2 | B2C: $1k@24 is 6.7% (target 17–19%) while any revenue is 100% | B2C has no baseline organic channel. RevenueCat's population is app-store apps with store search traffic. In the game, B2C volume comes only from paid ads (ROAS < 1: average spends $19k for 122 payers) and from posts with `audienceFit.b2c = 0.3` (`growth/params.js:195`). | Add an `organic:appstore` stream: 3–30 installs/day × latent demand × rating factor, ramping over 60 days after launch. | growth |
| R3 | B2C elite earns less than average (0.46×) | Elite levers don't touch B2C retention or acquisition. Interviews only add +0.2 relevance in `apps/product/fit.js:28-29`. Onboarding calls change conversion only (`core/params.js:130` ONBOARDING) and never churn. The B2C churn curve `core/params.js:97` (48% in month 1) is the same for everyone. | (a) Held onboarding or concierge calls: set `sub.churnMult *= 0.7` for 3 months (ELITE unscalable_concierge says early churn ×0.6–0.8; `apps/customers.js:109-120`). (b) Real interviews in the last 8 weeks scale new features' value by up to 1.3× and raise the chance a no-evidence feature is "unwanted" (u × 0.3). | product / customers |
| R4 | SMB elite median 10–15× average (edge/HIGH) and elite still < $10k 98% | SMB trial→paid is pinned at the 0.6 cap for every policy: `cardTrialFactor 2.2` (`core/params.js:109`) × productFactor × priceFactor reaches the cap at `core/market.js:105`. Card-required costs nothing on trial starts (`core/market.js:88-91` has no `cardRequired` term). So elite gets no extra conversion from quality, and average SMB's few visitors also convert at 60%. | `landingConversion × (cardRequired && model !== 'ent' ? 0.45 : 1)` for SMB (opt-out trials get about half the starts). Lower the cap for SMB card-required trials to 0.5. | core (market) |
| R5 | Too many "any revenue" founders (SMB 68%, B2C 100%) | Partly the bot (average founders all launch and market). Also, luck creator/press bursts and competitor-switch bursts give revenue to companies with no channel. | R1 fixes most of it. Keep `baselineVisits` floor 20 in the engine. | core |
| R6 | Personal runway caps everyone | 75–98% of non-mistakes bots end in a forced full-time job (`core/personal.js:378`, startup hours 55 → 25 around month 8–12). Default setup is $20k liquid savings at $3.8k/month. This flattens elite and average alike. | Default liquid savings to 12 months of costs ($45k) in setup (`main.js:231`), or show a hard warning. For calibration, treat the default as the population. | core (personal) / setup |
| R7 | Interviews are too cheap to recruit | `apps/research.js:118-131` `bookReal` charges `RECRUIT[channel].hours` but ignores `RECRUIT.response` (0.5 warm, 0.3 community, 0.1 cold), so every booking succeeds. | Charge `hours / response` (warm 0.6 h, community 2 h, cold 14 h) or roll the response and refund nothing on a miss. | product (research) |
| R8 | Founder outbound barely produces SMB customers | Elite spends 250–280 h/year prospecting for about 1 outbound customer in 3 years (average spends 145–180 h/year for 0). | Check the reply → meeting → won chain against e2e B (5 won in 3 years). Possibly the new segment gates. | sales |

## Changes applied (luck layer and targets only)

- `public/apps/outcomes/engine.js`
  - `burst()` takes a landing multiplier and a trial→paid multiplier. HN, Product Hunt top 3, press and viral bursts now use them (values live in `data/outcomes.js` magnitudes). Before, a single HN or press event created $5–30k of MRR in one month.
  - `activity().growthRateMonthly` now needs MRR a month ago ≥ $500 (`GROWTH_MIN_BASE`). Before, $50 → $100 MRR counted as "100% growth" and inflated press, investor and acquisition odds.
  - `acquisition_interest` gate uses the data's `minMrr` ($5,000) instead of a hard-coded $1,000.
  - `eventRate()` and `surfaceMultiplier()` apply `conditions.aiDependence`. Capability tailwinds are now ×0.2 for non-AI products, as the data says. Tailwinds per run went from 1.8–2.4 to 0.4–0.8.
  - Scorecard: `ship_fast` counts release days (a shipped feature or a fixed bug). `customerConversationsPerWeek` also counts held onboarding and concierge calls.
- `public/data/outcomes.js`
  - Added `landingMult` / `paidConvMult` to `hn_front_page` (0.5 / 0.3: 14–125 signups on 678–35k visits, "few paid"), `product_hunt_top3` (0.7 / 0.03, matching the organic Product Hunt paid conversion of 0.25–2%) and `press_feature` (0.7 / 0.5). Added `landingMultByModel` to `viral_post`, mirroring `ORGANIC.social.audienceFit`.
  - `mistakesPctDeadOrQuitBy24mo` changed from [0.8, 0.95] to [0.8, 1] (research §5.1 says "fail ≥80%", a floor).
  - `elitePctStillBelow10kMrrAt24moIndie` stays [0.3, 0.5], per the coordinator and the CLAUDE.md asymmetry rule. It is far from reachable today (98–100%); R1, R3 and R4 are what would move it.
- `npm test`: 332/332 pass.

## Free mistakes (cost the bots nothing; where they should bite)

Measured with a 6-month SMB probe (`scratchpad/fit.mjs`, same seed). In every arm the bot ships 23–26 features.

| arm | product fit | landing conversion | trial→paid | month-3 churn |
|---|---|---|---|---|
| elite: 5 interviews/week, narrow ICP, $79 | 0.95 | 3.7% | 0.60 | 3.6% |
| mistakes: 0 interviews, "everyone" ICP, $15 | 0.95 | 5.8% | 0.60 | 2.5% |

1. **Building 6 months without talking to anyone.** Fit still saturates at 0.95. Mistakes ship 41–44 features with no fit penalty and no wasted-feature risk. *Should bite* in `apps/product/fit.js:58-63` (`trueFit`): features whose spec cites no real evidence draw u × U(0.2, 1) (some are unwanted). Fit should decay without customer contact, and `overbuilt_before_validation` should raise latent bug and complexity cost.
2. **Underpricing** at 0.2–0.3× the median *improves* every funnel step. `priceFactor` reaches its 2.5 clamp (`core/market.js:71-77`): landing ×1.58, trial conversion capped anyway, and churn *lower* through `price^-0.3` (`core/market.js:113`). *Should bite* at that churn term: cheap plans attract non-ICP buyers, so use a U-shaped price effect where churn rises again below about 0.5× WTP (MicroConf: $1–9 plans add about a third of the new MRR). Also add support load per customer, so cheap customers still cost hours.
3. **"Everyone" ICP.** No measurable cost; landing is even higher because of the price. *Should bite* in `apps/product/fit.js:20-27` (relevance from ICP tokens): a broad ICP should cap relevance (e.g. 0.6) and lower landing conversion through the website judge (`apps/website.js` heuristicJudge). Narrow vs broad currently changes nothing once specs mention a role.
4. **No card required plus a free-ish trial** has no trial-start cost and no conversion penalty in SMB beyond the baseline opt-in rate (R4).
5. **Ignoring churn or skipping onboarding** has no compounding cost beyond the churn curve. No support debt, no review or reputation hit (`apps/customers.js` feedbackDay).
6. **Spec grading** passes evidence-free specs (mistakes ship 41+). Evidence is capped at 0/4, but the total still passes (`apps/product.js` gradeSpec → `PASS_TOTAL`). That is fine as a gate, but it should feed item 1.
7. **Paid ads before retention and hiring ahead of revenue** *do* cost: about $5–8k of ad spend plus contractors, and the company dies around month 9.5. The cost is real but always the same cliff (bank overdraft). There is no slower "going in circles" path, because a mistakes founder never runs out of runway gradually or gets the warnings, and **quit is 0%**: they die first.
8. **Interview recruiting** costs the same whether people reply or not (R7). Cheap contact-heavy play has no "burned list" cost.

## Harness limits

- Same idea and specs for every seed. Real variance across founders comes from different ideas, which the game would model with R1.
- The "average" bot is a committed founder who launches and markets. The targets' denominator includes starters who never launch. That explains part of the HIGH "any revenue".
- Interview notes are template text and all graded offline. Live LLM judges may differ.
- No enterprise cells. Spend runs on Meta and Google only; no creators or UGC.
- The result directories (`base/`, `fix1/`, `fix2/`, `exp-latent/`, `final/`) are listed in `calibration/.gitignore`. Another agent's WIP commit already added the `base/` JSONs to git.
