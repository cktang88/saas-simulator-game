# End-to-end realism review: whole-company outcomes from headless player bots

Reviewer scope: whole-company outcomes over 1–3 in-game years (Nov 2026 →), not individual tools.
Code under test: snapshot of the working tree at `625b48b` + 25 uncommitted files (2026-10-14 ~16:20 UTC). The tree was being edited during the review. Some first-pass findings were already fixed by the time of the snapshot: day-job hours now count in wellbeing (`core/wellbeing.js:45`), the persona budget no longer scales with list price (`apps/sales/replies.js:119`), the default enterprise ACV is now $15k, and security-review odds now depend on ACV. Those fixes are not listed below. All numbers come from the snapshot.

## Summary

- **No money printer, but the levers are mis-weighted.** No typical strategy reliably prints money. Building without selling earns $0 (good). Selling into SMB through founder-led outbound at $49/mo is realistically miserable. Creative quality decides B2C paid ads: average creative ≈ break-even-then-die, good creative = 25% reach $10k MRR within 22 months. That good-creative outcome is too optimistic.
- **The personal-finance trap fires on every default "quit your job" run.** With the default setup ($20k liquid savings, $3.8k/mo burn) every bot is forced into a full-time job by about month 7. FICO then falls to **320** in 100% of runs and never recovers. Burnout (≥1 episode) hits **100%** of bots that use their full hours. Both outcomes are far harsher than benchmarks and make the 3-year game mostly a nights-and-weekends game.
- **Building is too fast and "MVP" is too cheap.** One shipped spec makes `hasProduct` true. The median first feature ships at **0.3 months** and a 3-feature MVP at **0.6–1.0 months**, with no auth, billing or onboarding work.
- **Long-horizon performance is the biggest engineering risk.** Stripe subscriptions and customers are never pruned. At 30 trials/day the third sim-year takes **142 s** and the save is **37 MB** (stringify ≈ 0.4 s per save).
- **Money mostly ties out.** Across all 180+ runs, the sum of MRR movement events equals live MRR exactly (drift 0). Stripe gross − fees − refunds vs. bank payouts + in-flight funds leaves a gap of $5–9k over 3 years. The gap is consistent with dispute debits, but no invariant checks it.

## Bots (scripts in `docs/review/e2e-bots/`)

Every bot drives the real app modules: action functions where exported, otherwise a line-for-line replica of the UI handler (noted in code). It respects founder hours (`spendHours`; a bot that is out of hours waits for the next day). LLM jobs are drained with the offline fallbacks (`core/jobs.js drainJobs`), and time advances with `advanceOneDay(state, APPS)`. Each bot ran 20 seeds × 1,095 days, default setup ($30k company cash, $20k personal savings, $3.5k living + $300 debt, 55 h/week), except where noted.

| Bot | Behaviour |
|---|---|
| A builder | Landing page, then builds spec after spec every day. Never launches or sells. SMB, $49/mo. |
| B outbound | SMB $49/mo. Sequencer + 2 warmed inboxes. 6 researched + personalized prospects per weekday (60% in-ICP list), a 3-step sequence, replies within a day asking for a call, Mom-Test discovery calls, a proposal to every qualified deal. Product work fills the remaining hours. **B-bad** is identical but runs pitchy, hypothetical calls. |
| C B2C ads | $9.99/mo app, 14-day card-required trial. 3-feature MVP + panel, then a Meta Advantage+ broad campaign optimizing for trials, with 2 new static creatives every 3 weeks. Pauses ads below $5k cash and resumes above $15k. **C** runs "average" copy at $50/day; **C-good** runs one specific hook at $100/day. |
| D enterprise VC | $18k ACV. Atlas C-corp, founder stock + 83(b), template DPA. Pre-seed evaluation, then a $500k post-money SAFE at $6M cap pitched to 40 generated investors (warm intro where a path exists, otherwise cold), with scripted pitch answers containing numbers. Signs every SAFE offered. Takes 3 warm "design partner" intros plus 3 outbound prospects a day, and pays itself $6k/mo after $150k is raised. |
| E indie | SMB $29/mo. **E**: kept part-time job (game caps startup time at 40 h). **E-quit**: full-time founder. Network launch at MVP, 2 build-in-public posts a week, an SEO article every 2 weeks, a community post every 4 weeks. |
| scale | Injects 30 (B2C) or 5 (SMB) trials/day through `growth/acquire.js` for 3 years to measure performance, save size and money reconciliation. |

Reproduce: `cd docs/review/e2e-bots && ./runq.sh` (≈25 min on 4 cores), then `node analyze.mjs out/*.json`. Set `SIM_ROOT` to point at another copy of `public/`.

## Outcome distributions (p10 / p50 / p90 over 20 seeds; "—" = never)

| | A builder | B outbound | B-bad | C ads avg $50/d | C-good $100/d | D ent VC | E part-time | E quit |
|---|---|---|---|---|---|---|---|---|
| mo. to 1st feature | 0.3 | 0.4 | 0.4 | 0.3 | 0.3 | 0.4 | 0.4 | 0.3 |
| mo. to MVP (3 feat.) | 0.6 | 1.0 | 1.0 | 0.6 | 0.6 | 0.8 | 0.8 | 0.6 |
| mo. to 1st paying (share) | — (0%) | 1.7/3.6/12.4 (100%) | — (0%) | 1.1/1.2/1.3 (100%) | 1.1/1.2/1.2 | 4.1/9.7/24.8 (20%) | 1.3/1.4/4.6 (100%) | 1.1/1.2/4.3 (100%) |
| reach $1k MRR (median mo.) | 0% | 0% | 0% | 85% (7.4) | 100% (2.2) | 20% (9.7) | 60% (31.7) | 15% (33.3) |
| reach $10k MRR | 0% | 0% | 0% | 0% | 25% (10.3) | 0% | 0% | 0% |
| MRR @12 | 0 | 0/98/245 | 0 | 749/1219/2507 | 2697/4565/11359 | 0/0/1500 | 116/174/261 | 58/145/290 |
| MRR @24 | 0 | 0/98/245 | 0 | 360/1049/3127 | 2348/4625/14495 | 0/0/1500 | 348/493/725 | 261/406/667 |
| MRR @36 | 0 | 0/98/196 | 0 | 0/30/2657 | 0/3546/12318 | 0/0/1500 | 783/957/1247 | 609/783/1073 |
| dead by m12/m24/m36 | 0/0/0% | 0/0/0% | 0/0/0% | 0/10/50% | 0/10/20% | 0/5/5% | 0/5/5% | 0/0/0% |
| burnout ≥1 | 100% | 100% | 100% | 100% | 100% | 100% | 75% | 100% |
| forced into a full-time job | 100% | 100% | 100% | 100% | 100% | 100% | 0% | 100% |
| end FICO p50 | 320 | 320 | 320 | 320 | 320 | 320 | 720 (p10 480) | 320 |
| raised ≥$1 / ≥$250k | – | – | – | – | – | 20% / 0% (p90 $90k) | – | – |

Funnels (means per 3-year run):

- **B (good calls):** 2,725 prospects, 6,885 emails, 127 replies (1.8%/email), 55 positive, 33 meetings booked (0.48/100 emails), 18 held, 8 qualified, 5 won. Loss reasons: opted out 515, "asked to stop (too many meeting asks)" 50, **founder missed the meeting 46** (totals across 20 seeds).
- **B-bad:** same top of funnel, **0 qualified**. Call skill is decisive, which is correct.
- **C:** $36k ad spend for 1,134 trials and 511 payers. CAC $74 (p10–p90 $39–95), revenue $23k, ROAS ≈ 0.63.
- **C-good:** $105k spend for 6,600 trials and 2,974 payers. CAC **$36**, cost per trial **$16**, revenue $125k.
- **D:** 40 investors contacted, 5 pitches, 0.3 commitments (checks of $5k–90k). Sales: 1,187 prospects → 3 proposals → 0 won on average. **Design partners won: 0/60.** Design partners were held but not qualified, or lost on SOC 2 or price.
- **E:** subscriptions by source (mean): SEO 33, LLM answer engines 31, network 15, word of mouth 11. Visits: SEO 2,568, LLM 331, network launch **21**, social 47.

Hours per year (mean; calendar meeting time is not included, see F12):

- **A:** build 618; life/illness 232; unavoidable admin 198; low energy 157.
- **B:** prospecting/research 465; build 356; replies 11.
- **D:** build 542; prospecting 205; fundraising outreach 3.
- **E:** build 1,230; build-in-public 61; SEO 48.

## Benchmarks

| Metric | Real-world | Source |
|---|---|---|
| Apps reaching $1k monthly revenue within 2 years | ~17–20% (>80% never do); median 60 days for those that do; top 5% earn ~$8.9k/mo after year 1 | RevenueCat State of Subscription Apps 2025, via TechRepublic (2025-03) https://www.techrepublic.com/article/news-apps-revenue-developers/ and Sherwood https://sherwood.news/tech/data-shows-most-new-apps-dont-just-fail-they-completely-bomb |
| Health & fitness trial→paid | 30–45% (7-day, RC 2025); Adapty reports 62% on its own definition | https://appsops.store/blog/health-fitness-app-subscription-pricing-2026, https://adapty.io/blog/markdown/health-fitness-app-subscription-benchmarks.md |
| H&F median 1-yr install LTV | $1.21/install, which caps viable CPI around $1 | Adapty 2026 (same) |
| Earning bootstrapped SaaS ≥ $1k MRR | 23.6% (n = 3,787 earning businesses; survivor-biased) | https://bigideasdb.com/state-of-indie-saas-revenue-2026 |
| First paying customer within 30 days of incorporating | ~20% of 2025 Atlas startups (8% in 2020) | Stripe, 2025 annual letter (2026-02) https://stripe.com/newsroom/news/stripe-2025-update |
| $1M ARR within 3 years of monetizing | 13.4% (3.3% < 1 yr; 25.1% < 5 yr) | ChartMogul "Odds of making it" (2025-10-15) https://chartmogul.com/reports/saas-growth-the-odds-of-making-it/ |
| Cold email | 4–5.8% reply; ~0.4–1 meeting per 100 emails | Belkins 16.5M emails via https://thedigitalbloom.com/learn/cold-outbound-reply-rate-benchmarks/ ; https://moderninbound.com/blog/cold-email-conversion-rate-benchmarks |
| Seed → Series A within 2 years | ~17% (2022 cohort) vs 25–30% historically | Carta (2025-02) https://carta.com/data/linkedin-seed-to-series-a-getting-harder-2024/ |
| Pre-seed market | 50,316 SAFEs/notes, $10.4B in 2025; 35% of rounds < $250k; median cap $7.5–10M for < $500k rounds | Carta State of Pre-Seed https://carta.com/data/state-of-pre-seed-q2-2025/ |
| Founder burnout | 54% report burnout in the past 12 months | Sifted founder mental health 2025 https://sifted.eu/articles/founders-mental-health-2025 |
| Business survival | ~80% of new establishments survive year 1; 66% survive 2 years | BLS https://www.bls.gov/opub/ted/2018/18-percent-of-businesses-opening-in-march-1994-remained-open-as-of-march-2017.htm |

How the simulated outcomes compare:

- **Indie E (60% / 15% reach $1k by month 36):** brackets the 17–24% benchmarks. E-part-time is optimistic and E-quit is realistic.
- **Time to first paying customer:** 100% within ~1.5 months for every bot with any channel. Real data: ~20% within 30 days. The game is too generous here because friends-and-family trials convert at a fixed rate (F9).
- **B outbound:** emails → meetings matches the benchmark. Held → qualified (44%) is in range. Qualified → won (62%) is high, but the "missed meeting" leak offsets it.
- **C-good:** 25% reach $10k MRR at a $36 CAC and $16 per trial. That is roughly 2–4× better than real H&F economics (F6).
- **D:** 0% raise ≥ $250k from 40 investors, despite a domain-expert founder, design partners and a C-corp. That is harsher than a market that closed 50k pre-seed instruments in 2025 (F8).

## Findings

| id | sev | file:line (snapshot) | issue | evidence | benchmark | concrete fix |
|---|---|---|---|---|---|---|
| F1 | high | `core/personal.js:90-93` | Missed-payment FICO math compounds: −40×n each month, so 4 negative months take 720 → 320. Recovery is impossible. Part-timers (`job !== 'quit'`) are never rescued, so personal cash can stay negative forever. | FICO p50 = 320 in 7 of 8 bots. E-part-time ends with personal savings p10 −$922 and FICO p10 480. | A first 30-day late payment drops a 720 score ~60–110 pts. Further lates add less. Scores recover over 1–2 years (FICO/myFICO guidance). | Apply one-time drops (−80 first late, −20 for later lates, floor ~520). Recover +5/mo while current. Model credit-card float before "missed". Apply the forced job switch (or forced liquidation) to any job status. |
| F2 | high | `core/personal.js:93-97`, setup defaults `main.js:231-233` | Default inputs guarantee a forced full-time job around month 6–7 and a permanent 25 h/week cap. 100% of "quit" runs end in that state. The only exit is a manual switch in Financing. | All quit bots: `job=full_time` by month ~7. | Most full-time founders plan 12–18 months of personal runway. | At setup, show the computed personal runway and warn below 9 months. Notify at 3 months of runway with options (draw, loan, part-time). Make forced re-employment take 1–3 months of search. |
| F3 | high | `core/wellbeing.js:61-66` | Burnout (≥1 episode) reaches 100% for any bot that uses its full hours. A forced day job (40 h) plus the 25 h startup cap is 65 h/week of measured load, so episodes repeat. Energy sits at 0–10 for months (C-good seed 1). | burnout ≥1: 100% in 7 of 8 bots; 6 episodes in one C-good run. | 54% report burnout in a year (Sifted 2025). A clinical episode at 30–50% capacity for 2–6 weeks is rarer. | Cap the annual hazard at ~35% at 60 h. Make the post-episode refractory period longer than 8 weeks. When a forced job starts, default startup hours to 15 h, not 25. |
| F4 | high | `core/market.js:39`, `apps/product/spec.js:313` | One shipped spec = "a product". A 3-feature MVP takes 0.6–1.0 months. Agent-hour estimates (~15–40 h per spec) leave no time for auth, billing, onboarding or deploy. Builder bot A shipped 40 features in 400 days (pre-snapshot run). | MVP p50 0.6 mo for every bot. | Research §3.2 in the repo: narrow B2B MVP 2–6 weeks; real 2026 Stripe data shows only ~20% get a paying customer within 30 days. | Require a "foundation" item (auth + billing + onboarding, ~40–80 agent-h) before `hasProduct`. Scale landing/trial conversion by feature coverage of the panel's must-haves. |
| F5 | high | `core/stripe.js:249`, `core/stripe.js:35`, `core/network.js:43-44,107`, `apps/money/ledger.js:266` | Performance degrades over long horizons. Subscriptions and customers are never pruned. `cust()` and `subscriptions.find` are linear per sub or charge. `companyStage()` scans all subs once per archetype per day. | Scale B2C (30 trials/day): years 1/2/3 = 14 / 56 / **142 s**; 36.6k subs (1.3k active); save **37 MB**; `JSON.stringify` 384 ms per save. SMB 5/day: 3 / 10 / 17 s per year; 11 MB. Profile: `books.onDay` / `syncLedger` 24%, `networkDay` 16%, `invoiceAndCharge` + `cust` 16%. | – | Index customers and subs by id (Map, rebuilt on load). Archive canceled subs older than 120 days into monthly cohort summaries. Compute `companyStage` once per day. Make `syncLedger` incremental with a sub-id map. Debounce saves and store large slices separately. |
| F6 | med | `apps/growth/adsEngine.js:309` (CPA chain), `apps/growth/judges.js` (offline creative judge) | B2C paid ads with one well-written hook are too efficient: cost per trial $16, CAC $36, 25% of runs reach $10k MRR in about 10 months on $100/day. Average copy gives $32 per trial and CAC $74 (plausible). One fixed hook judged "good" by the offline heuristic is reused for 3 years. | C-good vs C (see table). | H&F 1-yr install LTV $1.21 (Adapty 2026). Top 5% of apps make ~$8.9k/mo after a year (RevenueCat 2025). | Add creative fatigue per concept (the same hook text loses CTR over time even as "new" ads). Put a floor on cost per trial by category (~$25–60 for H&F web-to-app). Draw hidden quality wider for offline-judged creatives. |
| F7 | med | `apps/sales/deals.js:96`, `apps/sales/replies.js:119` | Price elasticity in sales-led SMB is still too weak. At $999/mo (20× the panel's WTP) the bot closes 5 deals vs 26 at $49 (8 seeds × 1 yr), yet mean MRR12 is **3× higher** ($375 vs $129). Overpricing is the dominant strategy. | Bp999 vs Bp49 runs. | SMB buyers at 20× WTP essentially never buy. | Gate `closeProbability` on price/WTP (from `market.fit.price.wtp`). Above 3× WTP → p ≈ 0. Treat the `sqrt(budgetRatio)` clamp floor of 0.15 as too generous. |
| F8 | med | `apps/fundraising/sim.js:225`, `fundraising/outcomes.js` | A credible enterprise pre-seed never reaches $250k. 20% raise anything (p90 $90k). Commitments are angel-sized, and cold emails to funds mostly ghost (27 of 40 "contacted" forever). No follow-up path gets a stale investor back into play. | D: 40 investors → 5 pitches → 0.3 commits. | 50k pre-seed SAFEs in 2025; median rounds $250k–1M (Carta). | Calibrate pMeeting for warm paths (20–40%) vs cold (2–5%). Let one lead commit 40–60% of the round. Add "follow-up with progress" that re-rolls a ghosted investor. Add a regression test: a domain-expert founder with design partners and 40 targeted investors has ≥25% odds of a ≥$250k close. |
| F9 | med | `apps/growth/organicModel.js:110`, `growth/params.js:180-183` | The network launch is tiny in reach but guarantees early payers. LinkedIn 500 connections → ~20 visits, yet ~15 network trials convert at a fixed `payProb`, so 100% of bots with any channel get a paying customer by about month 1.5. | E: first paid p50 1.4 mo, 100%. | ~20% of Atlas startups get a first customer within 30 days. | Make friends' paid conversion depend on ICP fit and product fit, not a constant. Allow 0. |
| F10 | med | `core/calendar.js:113-121` | Calendar meetings are charged at the start of the day and missed outright when the week's hours are gone. Nothing reserves hours for booked calls, so across 20 seeds the bot lost 46 deals (B) and 26 (D) to "you missed the meeting", ~7–9% of booked calls. | B: 46 missed of ~660 booked; D: 26 of ~280. | Founders protect sales calls. | Reserve booked meeting hours at booking time (`hoursLeft` subtracts this week's scheduled events). Warn before an action eats reserved time. |
| F11 | med | `apps/marketworld/engine.js:135` | A competitor exit drops a fixed 5–60 inbound customers, independent of company size or market. A B2C app with 100 subs got 75 free subscriptions on average (C). | C: competitor-switch 75 subs (~6% of all); 52–80 in other B2C runs. | – | Scale the burst by `rival.customers × yourShare` (share from landscape pressure). Make it B2B leads only with probability ∝ fit. |
| F12 | low | `core/calendar.js:120` | Calendar-charged hours (calls, pitches, onboarding) are not written to `founder.timeLog`. `timeLog` is truncated to the last 800–1000 entries, so the "hours by category" UI under-reports meetings and loses history after ~1 year. | Bot tallies vs `timeLog` diverged. | – | Push a timeLog entry when the calendar charges. Aggregate timeLog per week into a summary instead of splicing. |
| F13 | low | `apps/financing.js:176-183` | Changing job status is instant: a full salary starts at once and quitting is free. A player can toggle to a full-time job just before personal savings go negative, then quit again. | Code read. | Job search takes 1–4 months. | Add a job-search delay (30–120 days) before income starts. |
| F14 | low | money reconciliation | No invariant ties Stripe to the bank. The 3-year gap (expected net − paid out − in-flight) is $9.3k with 245 disputes (B2C) and $5.1k with 50 disputes (SMB), plausibly dispute debits plus fees but unverified. MRR events vs live MRR: exact in every run. | scale runs. | – | Add a test asserting gross − fees − refunds − dispute debits = payouts + pending + available ± $0.01. |
| F15 | low | offline judges (`apps/product/panel.js:87`, `apps/website.js heuristicJudge`) | Offline fit is driven by keyword overlap with the one-liner/ICP. In a pre-snapshot run, rewriting the same B2B specs with ICP words moved B2C product fit from 0.20 to 0.73 and trial→paid from 21% to 58%. Offline play rewards keyword stuffing. | probe run (pre-snapshot `heuristicTrial`). | – | Cap the keyword-overlap contribution. Penalize repeated ICP tokens. Use a deterministic hidden "true need" per model. |

## Exploits and dead ends

- **Exploit, overpricing in sales-led SMB (F7):** list price 20× WTP gives 3× the MRR.
- **Exploit, offline keyword stuffing (F15):** stuffing specs and the landing page with ICP words lifts fit scores.
- **Exploit, instant job toggling (F13):** salary can be switched on and off at will.
- **Exploit, one great ad hook (F6):** a single good hook carries B2C to $10k MRR in 25% of runs.
- **Dead end, personal finances (F1/F2):** after month ~7 the default founder is permanently capped at 25 h/week with FICO ≈ 320. FICO-based financing (personal loans, 0% cards, HELOC) is then closed for the rest of the game.
- **Dead end, part-time founder (F1):** a part-timer whose pay doesn't cover living costs bleeds personal cash forever with no game event.
- **Dead end, enterprise design partners:** 0/60 closed. Persona `hasPain` follows research `fit` even for warm, hand-picked design partners. Non-qualified warm deals sit at "meeting held" forever, with no pilot or LOI path.
- **Runaway loops:** none found. Word of mouth stays ~10–20% of acquisition (C-good: 1,223 WOM vs 6,490 ads). SEO and LLM-citation traffic grows slowly. No exponential growth appeared at 36k subscriptions.

## Performance

| scenario | ms per sim-year (p10 / p50 / p90) | save size |
|---|---|---|
| A builder | 1.7k / 2.1k / 2.7k | 2.9 MB |
| B outbound (2.7k CRM contacts) | 1.7k / 4.1k / 19.3k | 10 MB (CRM companies/activities/deals) |
| C-good B2C (~7k subs) | 2.4k / 10.2k / 25.0k | 13 MB (p90 19 MB) |
| scale B2C 30/day | year 1/2/3 = 14 / 56 / 142 s | 37 MB, stringify 384 ms, parse 342 ms |
| scale SMB 5/day | 3 / 10 / 17 s | 11 MB |

Timings were taken with 4 processes sharing 4 cores. Growth is super-linear in total (not active) subscriptions (F5). The UI "advance 1 year" button will hang the tab for minutes in a successful B2C game.

## Caveats

- Bots run offline (heuristic judges). Live LLM judges may score copy and calls differently.
- Bots are deliberately simple. They never hire, change price, pay themselves (except D), raise a seed after pre-seed, or use Channels/Pricing/Helpdesk actions.
- Results come from one code snapshot. Re-run `runq.sh` after fixes; each bot's verdict above should move toward the benchmark column.
