# Outcome calibration, round 2: new tools, mistakes ledger, personal runway

Measured on 2026-10-14 at commit `faa27f1` (branch `claude/saas-simulator`). The run had no uncommitted changes outside `docs/review/calibration/`; other agents' WIP commits had already picked up this pass's edits to `public/apps/outcomes/engine.js`. Round 1 is `docs/review/calibration.md`, measured at `30fb8dc`.

The grid ran 50 seeds per cell for 36 months: indie and vc × b2c and smb × the three policies. On top of that I ran a paired experiment (elite with the average policy's ICP text, 50 seeds per model) and an enterprise elite probe (20 seeds per path). Judges run offline (no API key).

Raw output: `docs/review/calibration/final2/` holds `report.md` (main grid, before → after), `paired.md`, `ent.md`, `summary.json` and the per-run JSON. Reproduce with `cd docs/review/calibration && ./run.sh 50 1095 10 "b2c smb" "indie vc"`, then `BEFORE=round1/summary.json node analyze.mjs out/indie-*.json out/vc-*.json`. The main grid takes about 60 min on 4 cores; the elite B2C runs take about 35 s each.

## Harness changes for round 2

Everything goes through the real app modules or exact replicas of the UI handlers, and spends hours at the UI's prices (new file `docs/review/calibration/ops.mjs`).

| area | elite | average | mistakes |
|---|---|---|---|
| Product: AI coding | `TIER_WORKFLOWS.stellar`, plus error monitoring and alerts (1.25 h, $26/mo) | default workflow | `mediocre` (auto-accept, no review, prod access) |
| Specs and evidence | Links real insights that mention the problem, from distinct interviewees, plus commitments. Never re-specs an idea killed in the last 90 days. | Pastes the 3 newest insights (lazy) | No evidence |
| Feature decisions (30-day check) | Keep hits; iterate once (graded v2 spec); kill a v2 that misses again | Never decides (default keep) | Never decides |
| Payments | Smart Retries, card updater, pre-expiry and trial reminders, 4-step human dunning (2.4 h) | Stock defaults | Stock defaults (no setup) |
| Lifecycle email | Loops, SPF/DKIM/DMARC, retention analysis, then picks the activation event; hand-written welcome and nudge flows with goal exit | none | Unedited AI drafts with a discount, no DNS, monthly 40%-off blast to everyone |
| Growth | Release posts only when something shipped; Show HN after 6+ features; PH relaunch only after 6 months *and* real change. B2C: ASO listing; rating prompt after a success moment once at 10+ customers. | One network launch, rare posts | Network relaunch every 45 days with no change, Show HN and a PH relaunch regardless, rating prompt on open |
| Sales (SMB/ent) | Apollo-style database, weekly tight list: owners, ICP segment, ICP tech, size, US. 5-row test, then reveal, reasons, personalized first line and verification. Paid notetaker, review (catches ~90% of wrong fields) plus recap; nudges stale deals; delivers paperwork; maps buying groups and multithreads (3 asks per deal); ent: paid pilots. | Manual research, 3 prospects/day; post-call notes 12 min (`NOTETAKER.hours.manualNotes`); delivers paperwork under $500 | Unfiltered database blast of 200/week, no verification or personalization; reply inbox on autopilot; notetaker auto-shares unreviewed notes |
| Ops hygiene | Status update on incidents (Sundays too); receipts weekly; monthly stack audit that cancels unused tools; acts on strong churn signals with the tactic that fits the likely reasons | none | Assistant on auto with write scope (mail, books) for customer email, receipts and the investor update |

Other changes:
- The People coding seats from round 1 are gone: the default stack already bills a Claude Max plan, and adding seats double-counted.
- Personal setup now uses liquid savings of $40k, matching the setup default.
- Founder pay is the same rule for every policy: 80% of (MRR − recurring bills), capped at living costs plus debt. Round 1 paid half of MRR, which forced even $5k-MRR founders into a job.
- Hours check: post-call notes now cost 0.2 h without a notetaker and 0.06 h review plus 0.1 h recap with one, matching `calls.js`.

## Summary

1. **B2C now has a realistic right tail.** Hidden demand and the app-store stream put average B2C p95 MRR at 24 months at $8.8k (target $6–12k); it was $649 in round 1. 6% reach $10k by month 24 (target 4.6–5.3%), and the 12-month median is $60 (target $50–100). But 96% earn something, and 20–26% reach $1k, which is too generous.
2. **SMB average collapsed.** Median MRR is $0, $1k by month 12 went from 12% to 2%, and only 4% are still active at 36 months. Elite SMB is strong: median $869 at 24 months, 52% reach $1k by 24 months, 6–8% reach $10k.
   - The cause: founder-led outbound at $49–79 almost never converts (1,650 emails → 25–40 replies → 0–1 won per run). Average SMB has no channel left that works.
3. **Elite vs average in B2C is confounded by wording.** With its own (narrow) ICP text, elite B2C is 0.87× average. With the same ICP text as average (paired seeds), elite is **5.2× the median** (in range).
   - Two hidden levers key on ICP wording: hidden demand is re-drawn from the text (`core/market.js:43`), and the B2C churn category is inferred from keywords (`core/churn.js:91`). "…get fitter and build better habits" maps to *productivity*; "…exercise at home" maps to *health_fitness*.
   - That is a reroll exploit as well as a calibration confound.
4. **Mistakes now pay traceable costs.** Per run they log 123–132 mistakes: 1,150–1,300 founder hours, $10–12k, 11–58 customers, about 35 reputation points and 47–79 days, all on the ledger. Every mistakes run dies (bank overdrawn) around month 8 (target ≥80% dead or quit by 24 months).
5. **Elite still clears $10k in only 0–8% of runs** (target 50–70%, i.e. "30–50% still below $10k"). Elite raises the odds but the ceiling is low. Personal runway is part of it: 66–94% of non-mistakes founders are forced into a job search by month 24 (median month 14).

## Average policy vs OUTCOME_TARGETS (round 1 → round 2)

| cell | metric | target | round 1 | round 2 | in/out |
|---|---|---|---|---|---|
| indie b2c | any revenue by 12 mo | 35–60% | 100% | 96% | HIGH |
| indie b2c | $1k by 12 mo | 10–15% | 1.7% | 20% | HIGH |
| indie b2c | $1k by 24 mo | 17–19% | 6.7% | 26% | HIGH |
| indie b2c | $10k by 12 mo | 2–3.5% | 0% | 0% | LOW |
| indie b2c | $10k by 24 mo | 4.6–5.3% | 0% | 6% | HIGH (edge) |
| indie b2c | $100k by 36 mo | 0.3–0.8% | 0% | 0% | LOW (n=50 cannot resolve) |
| indie b2c | median MRR at 12 mo | $50–100 | $280 | $60 | **in** |
| indie b2c | bottom quartile MRR at 12 mo | $0–19 | $180 | $20 | HIGH (edge) |
| indie b2c | p95 MRR at 24 mo | $6–12k | $649 | $8,761 | **in** |
| indie b2c | median days to $1k, if reached | 45–90 | 377 | 92 | HIGH (edge) |
| indie b2c | still active at 36 mo | 25–45% | 30% | 18% | LOW |
| indie smb | any revenue by 12 mo | 40–60% | 68% | 52% | **in** |
| indie smb | first customer ≤30 days after launch | 15–25% | 33% | 22% | **in** |
| indie smb | $1k by 12 mo | 10–18% | 11.7% | 2% | LOW |
| indie smb | $10k by 24 mo | 3–6% | 0% | 0% | LOW |
| indie smb | median MRR at 12 mo, all starters | $0–50 | $98 | $0 | **in** |
| indie smb | median MRR at 24 mo, earners | $100–300 | $392 | $98 | LOW (edge) |
| indie smb | still active at 36 mo | 30–50% | 33% | 4% | LOW |
| vc b2c / vc smb | $1M ARR by 24 mo | 5–25% | 0% | 0% | LOW |

Still not measurable: Series A, 60/72-month outcomes and the annual-plan cancel rate.

## Policy expectations (round 2)

| cell | metric | target | measured | in/out |
|---|---|---|---|---|
| indie b2c | elite median MRR24 ÷ average | 3–10× | 0.87× ($26 / $30); **paired, same ICP text: 5.2× ($156 / $30)** | LOW; paired **in** |
| indie b2c | elite p90 ÷ average | 3–5× | 0.80×; paired 0.99× | LOW |
| indie b2c | elite still < $10k at 24 mo | 30–50% | 94% (6% reach $10k); paired 96% | HIGH |
| indie b2c | elite $100k by 36 mo | 1–3% | 0% | LOW |
| indie smb | elite median ÷ average | 3–10× | ∞ ($869 / $0); paired $600 / $0 | n/a (average median is 0) |
| indie smb | elite p90 ÷ average | 3–5× | 48× ($6,993 / $147) | HIGH |
| indie smb | elite still < $10k at 24 mo | 30–50% | 94% | HIGH |
| vc b2c | elite median ÷ average | 3–10× | 0.29× (VC average spends raised money on ads) | LOW |
| vc smb | elite median ÷ average | 3–10× | ∞ ($679 / $0) | n/a |
| all | mistakes dead or quit by 24 mo | 80–100% | 100% (all dead, month ~8) | in |
| indie | mistakes reach $10k by 24 mo | 0–1% | 0% | in |

## Distributions (round 2)

| cell | any rev 12 | $1k@24 | $10k@24 | MRR12 p25/p50 | MRR24 p50/p90/p95 | MRR36 p50/p95 | dead / quit by 24 | active 36 | raised >0 / ≥$250k |
|---|---|---|---|---|---|---|---|---|---|
| indie-b2c-average | 96% | 26% | 6% | 20/60 | 30/6,094/8,761 | 0/7,343 | 2% / 62% | 18% | – |
| indie-b2c-elite | 100% | 20% | 6% | 13/78 | 26/4,858/6,885 | 13/5,573 | 4% / 60% | 34% | – |
| indie-b2c-mistakes | 92% | 0% | 0% | 0/0 | 0/0/0 | 0/0 | 100% / 0% | 0% | – |
| indie-smb-average | 52% | 4% | 0% | 0/0 | 0/147/245 | 0/294 | 2% / 92% | 4% | – |
| indie-smb-elite | 100% | 52% | 6% | 313/553 | 869/6,993/9,354 | 853/13,699 | 0% / 14% | 82% | – |
| indie-smb-mistakes | 86% | 0% | 0% | 0/0 | 0/0/0 | 0/0 | 100% / 0% | 0% | – |
| vc-b2c-average | 98% | 32% | 8% | 40/210 | 90/8,691/9,800 | 60/8,302 | 2% / 54% | 40% | 46% / 12% |
| vc-b2c-elite | 100% | 20% | 2% | 26/78 | 26/5,300/5,690 | 13/5,897 | 2% / 66% | 28% | 50% / 20% |
| vc-b2c-mistakes | 98% | 0% | 0% | 0/0 | 0/0/0 | 0/0 | 100% / 0% | 0% | – |
| vc-smb-average | 52% | 4% | 0% | 0/0 | 0/196/343 | 0/392 | 0% / 92% | 4% | 38% / 8% |
| vc-smb-elite | 98% | 44% | 8% | 395/679 | 679/7,575/11,951 | 885/16,931 | 2% / 18% | 76% | 60% / 28% |
| vc-smb-mistakes | 84% | 0% | 0% | 0/0 | 0/0/0 | 0/0 | 100% / 0% | 0% | 0% / 0% |

**Enterprise elite probe** (20 seeds, `final2/ent.md`):

| path | $1k by 12 mo | median MRR at 24 mo | p95 MRR at 24 mo | $10k by 24 mo |
|---|---|---|---|---|
| indie | 100% | $6,000 | $14,400 | 25% |
| vc | 100% | $4,500 | $13,200 | 15% |

That is too easy. Most wins come from **Product Hunt leads**: 5–13 won per run at $18k ACV, a ~60% close rate. Outbound adds 1–4 wins from 2,200 emails. Booked meetings run to 200–1,200 per run, mostly multithreading, and 18–170 are missed for lack of hours.

Elite habits at month 6 (Scorecard): customer contact 54–88%, ship fast 78–90%, **many shots 98–100%** (launches now counted, see changes), concierge 72–78% (SMB), charge early 40–60%. Build in public stays at 0% (posting fatigue holds elite at ~2 quality-weighted posts a week), and so does PMF measurement (no Insights survey in the harness).

## Mistakes ledger per policy (mean per run, 36 months)

| cell | count | going in circles | hours | $ | customers | reputation | days | top entries |
|---|---|---|---|---|---|---|---|---|
| indie-b2c-average | 194 | 0 | 95 | 13,205 | 110 | 0.4 | 40 | lost to a failed payment (stock dunning) 53.5, receipts missing at close 31, silent outage 19.7, kept missed feature 15.6, unused tools 7.4 |
| indie-b2c-elite | 47 | 5 | 91 | 4,514 | 2.4 | 0.2 | 38 | silent outage 14.5, receipts 13.7, unused tools 5.4, going in circles 4.6 |
| indie-b2c-mistakes | 132 | 0 | 1,215 | 10,069 | 52 | 37.6 | 74 | unvalidated feature 19.4, unreviewed agent code 19.4, AI wrong number used 17.3, kept missed feature 16.9, prompt injection 13.8, AI replaced the human loop 7.9 |
| indie-smb-average | 82 | 0 | 315 | 16,566 | 2.8 | 1.0 | 7 | receipts 34.6, unused tools 14.7, kept missed feature 12.7, silent outage 8.6, unvalidated feature 7.4 |
| indie-smb-elite | 78 | 6 | 104 | 46,232 | 18.7 | 1.1 | 25 | silent outage 13.3, missed churn signal 11.2, wrong save tactic 8.3, ignored support backlog 6.9, going in circles 5.8, renewal discount 5.6 |
| indie-smb-mistakes | 124 | 0 | 1,302 | 11,423 | 10.8 | 35.0 | 79 | (as B2C mistakes) |
| vc-b2c-average | 247 | 0 | 110 | 17,504 | 143 | 3.7 | 28 | stock dunning 63.2, receipts 30.6, silent outage 22, investors went quiet 12 |
| vc-b2c-elite | 64 | 4 | 95 | 8,298 | 1.3 | 4.1 | 32 | silent outage 14.8, investors went quiet 14.5, receipts 14.5 |
| vc-b2c-mistakes | 125 | 0 | 1,159 | 10,978 | 58 | 35.0 | 47 | (as above) |
| vc-smb-average | 98 | 0 | 318 | 17,158 | 3.8 | 4.0 | 5 | receipts 35, unused tools 15, kept missed 13, investors went quiet 11.2 |
| vc-smb-elite | 86 | 5 | 100 | 34,352 | 11.2 | 5.1 | 29 | investors went quiet 16, silent outage 12.2, missed churn signal 9.1, ignored backlog 9.0 |
| vc-smb-mistakes | 123 | 0 | 1,251 | 10,779 | 10.7 | 36.7 | 51 | (as above) |

How to read it:
- Mistakes pay roughly 12× the hours and 20–35× the reputation of the other policies, and every cost is traceable.
- Average pays mostly in customers (B2C: 110–143 lost to stock dunning) and money (receipts, unused tools).
- Elite's ledger still carries **$34–46k a run in SMB**. That is mostly the dollar value logged for missed churn signals and wrong save tactics. Acting on churn signals is a noisy game, so the cost is plausible, but the dollar figure is booked as ACV × 12 per entry, which inflates it.
- "Going in circles" is non-zero only for elite (4–6 per run). That is the harness's finite pool of spec ideas, re-specced after kills, so it is partly an artifact.

## Personal runway (setup default $40k, founder pay = 80% of MRR after bills)

| cell | forced job search by 12 / 24 mo | in a forced job by 24 mo | median month of search | months in a job (p50 of 36) | MRR when forced (p50 / p90) |
|---|---|---|---|---|---|
| indie-b2c-average | 2% / 88% | 88% | 14 | 13 | $60 / $4.3k |
| indie-b2c-elite | 14% / 90% | 88% | 14 | 13 | $78 / $5.2k |
| indie-smb-average | 10% / 100% | 98% | 14 | 14 | $0 / $343 |
| indie-smb-elite | 4% / 94% | 84% | 14 | 12 | $632 / $7.8k |
| vc-smb-elite | 2% / 66% | 66% | 14 | 11 | $553 / $3.2k |

The top decile is forced into a job search at $3–8k MRR. The trigger (`personal.js:378`) fires on a missed payment or >80% card utilization from months when savings were draining, even if founder pay now covers costs.

**Why forced jobs still dominate.**
- Burn is $3.8k a month. $40k of savings covers ~10.5 months; the founder searches for 60–120 days and lands a job around month 14–17.
- Most bootstrapped businesses earn less than living costs (median MRR $30–870), so this is mostly realistic.
- The design problem is the shape of the response:
  - It is always a **full-time** job, which caps the company at 25 h/week.
  - The trigger is a missed payment or cards >80% utilized, whatever the trajectory.
  - The way back needs 3 clean months *and* either a salary that covers all costs or 6 months of savings.
- So founders with $3–5k MRR and growth are knocked down to 25 h for about a year, which cuts off the tail.

**Proposed `core/personal.js` fix** (owner: core/personal):
1. Don't trigger when this month's net founder pay already covers ≥80% of burn (the trigger currently reacts to past shortfalls). Otherwise, at the forced-search trigger (`personal.js:378`), if net founder pay ≥ 30% of burn, or MRR grew ≥5% a month over the last quarter, search for **part-time** work instead (45% income, startup keeps 40 h). Otherwise search full-time.
2. Before forcing, offer a "cut living costs" action (−15–25% burn, one-time, with a logged wellbeing cost), and keep logging the forced job as a `cash_runway` mistake.
3. In `maybeReturnToStartup`, return when net pay covers ≥80% of burn with 3+ months of savings, not 100% or 6 months.

Expected effect: elite founders with $2k+ MRR keep 40 h instead of 25 h for about 12 months. That should roughly double their 24→36-month growth and move the elite $10k share toward the target.

## Remaining free mistakes (cost nothing or untraceable) and where they should bite

| # | mistake | what happens now | where it should bite (owner) |
|---|---|---|---|
| F1 | **Rewording the ICP or one-liner re-rolls hidden demand** | `marketDemand()` hashes the exact text (`core/market.js:43`): a free reroll until signups look good | Key the draw on the idea's category or embedding, or re-draw only through an explicit pivot that costs time and is logged (`assistant/planner` pivot mistakes already exist) (core/market) |
| F2 | **Rewording the ICP changes the B2C churn category** | `inferB2cCategory` counts keywords across one-liner *and* ICP (`core/churn.js:91,104`): "habits" gives *productivity*, "exercise" gives *health_fitness*, with different churn mixes | Pick the category at setup or infer from the one-liner only; never from ICP wording (core/churn) |
| F3 | An explicit "keep" on a missed feature clears the penalty | `decideFeature(… 'keep', any reason)` avoids `kept_missed_feature` (`product/engine.js:361`; the default keep at `:306` logs it) | Log `kept_missed_feature` unless the reason names a new target metric and date; repeat at the next check (product) |
| F4 | Underpricing (0.3× median) | Costs show up through `cheap` in the funnel and churn, but nothing reaches the ledger | Log `underpriced` (pricing function) with the monthly revenue gap vs median and the extra churn it causes (pricing/money) |
| F5 | Hiring contractors ahead of revenue | Shows only as a bank overdraft; no ledger entry | People: log `premature_hire` when payroll > 2× MRR and runway < 6 months, with burn × months as the cost (people) |
| F6 | Paid ads at $100/day before any retention | $2.4–8k of ad spend shows up only on the bank statement | Growth: log `scaled_before_retention` when daily budget rises (or starts ≥$50/day) while month-1 churn is above benchmark or paid conversions are < 5 (growth) |
| F7 | A broad "everyone" ICP | Fit is capped (`fit.js` broadIcpCap) but nothing is logged | Log `broad_icp` at the first spec or launch with the fit cap applied (product) |
| F8 | Recruiting interviewees ignores the reply rate | `bookReal` books every request (`research.js:118`); round-1 finding, still open | Charge hours ÷ response or roll the response (research) |
| F9 | (forced, not free) Incident comms are blocked when the week's hours are used | Founders who used every hour log `silent_outage` 12–15 times per run, even diligent ones; calendar meetings get 8 h overtime, but `postStatusUpdate` goes through the hour cap | Allow 0.25 h overtime for incident status updates, like `MEETING_OVERTIME` (support/core) |

Free mistakes that now cost something (round 1 → 2): stealth building (unvalidated features plus fit decay), relaunching with no change (`relaunch_no_change`), rating prompt on open (stars 2.7 vs 4.2–4.6), untargeted blasts (`bought_list`, `discount_blast`), autopilot (`autopilot_mislabel`, `prompt_injection`, `wrong_number_used`, `replace_human_loop`), stock dunning (`one_email`, 53–63 per run in B2C), unreviewed AI notes.

## Ranked root causes and proposed fixes by owner

| rank | miss | root cause (file:line) | proposed change | owner |
|---|---|---|---|---|
| 1 | Elite vs average comparisons in B2C; reroll exploit | Hidden demand keyed on exact ICP/one-liner text (`core/market.js:43`); churn category inferred from ICP keywords (`core/churn.js:91`) | F1, F2. After this, re-run the paired comparison; paired elite B2C is 5.2× the median today | core |
| 2 | SMB average median $0; $1k by 12 mo 2%; 4% active at 36 mo | Founder outbound barely converts: average 1,650 emails → 25–40 replies (1.5–2.4%) → 0–1 won in 3 years; elite with tight, verified lists wins 1–2 outbound deals plus PH/SEO. Paperwork items (W-9, PCI attestation) killed deals before bots delivered them. | Check reply rates for in-ICP, personalized SMB email (benchmark 4–6%) against `apps/sales/replies.js`. Check that small-SMB segments do not demand vendor paperwork more often than real micro-merchants do. | sales |
| 3 | Elite ≥$10k at 24 mo only 2–8% (target 50–70%) | No compounding loop beyond hidden demand. Personal runway forces 25 h/week around month 14 (`core/personal.js:378`). | The personal-runway fix above. Let WOM K rise with activation (lifecycle activation ×4 conversion already exists), toward the cap of 0.6. | core/personal, growth |
| 4 | B2C: 96% earn something; $1k too common (20–26%) | App-store stream gives every launched app 3–30 installs a day, ×demand^0.5, from day 1 (`growth/organicEngine.js:282` `appStoreDay`) | Scale the baseline by ratings count (cold start ≈1–3 a day until ~20 ratings) and require an ASO listing for search traffic | growth |
| 5 | Enterprise elite is too easy (indie: 100% first contract by 12 mo; 25% reach $10k by 24 mo) | Inbound leads from PH/HN reach the CRM as in-ICP buyers: `addInboundLead` (`sales/crm-api.js:11`) has no fit, and PH-sourced ent deals close at ~60% | Draw inbound lead fit by channel audience (PH/HN ×0.2 for ent, SEO/referral ×1), and route low-fit leads to "not a buyer" | sales/growth |
| 6 | Indie still-active at 36 mo low (B2C 18%, SMB 4%) | Quit rule (harness) plus SMB channel collapse; B2C deaths rose (24% by 36 mo) because founders pay themselves from thin MRR while ads continue | Mostly follows from #2 and #3; consider a "pause ads at <3 months runway" warning (growth) | – |
| 7 | Incident comms blocked by the hour cap (F9) | `helpdesk.js` `postStatusUpdate` through `ctx.act` hours | 0.25 h overtime allowance | support |
| 8 | Free/untraced mistakes F3–F8 | see table | see table | product, pricing, people, growth, research |

## What I changed (allowed files only)

- `public/apps/outcomes/engine.js`, `activity()`:
  - `launchesPerYear` now counts organic's `launches` log: only launches flagged `legit`, with release announcements at ¼ weight.
  - Re-launches with no change count for nothing (before, only the first network/PH launch counted, so "many shots" was unreachable and no-change relaunches got luck credit).
  - Falls back to the old count when no launch log exists (tests and old saves).
  - `test/outcomes.test.js` passes; `npm test` passes 487/487.
- `public/data/outcomes.js`: no further change. Round 1's targets stand, including `elitePctStillBelow10kMrrAt24moIndie: [0.3, 0.5]` per the CLAUDE.md asymmetry rule.
- Luck needed no other tuning. Positive draws per run: elite ≈ 1.5–2×, mistakes ≈ 0.1× average. HN front page shows up in 18–46% of elite runs vs 2–4% for average, because legit Show HN launches now count. Event conversion is unchanged since round 1.

## Limits

- Every seed of a policy uses the same idea text. Policies differ in ICP text, which re-rolls demand and B2C churn category (F1/F2). The paired run removes that for elite vs average.
- The spec pool is finite (4–6 ideas per model), so elite eventually re-specs killed ideas: about 5 "going in circles" entries per run.
- Elite uses every weekly hour. The hour cap stops it from posting incident status updates on those days (F9), and enterprise multithreading overbooks the calendar (18–170 missed meetings per run).
- No Insights PMF survey, no Helpdesk work and no enterprise RFP strategy in the harness.
- The round 2 grid ran in three passes. Only the final pass (`final2/`) is reported; earlier passes in `r2a/` and `round2/` used older bot rules.
