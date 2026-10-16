# How VCs decide, 2026: fund math, tiers, pedigree, venture scale (research for the simulator)

Compiled 2026-10-16 from five research passes. Tags: **[measured]** published stat (often via a secondary summary; Carta pages returned 403 so several are search snippets, flagged); **[heuristic]** practitioner rule of thumb, no audited dataset; **[design]** game calibration, never shown to players as a real statistic; **[unverified]** secondhand, confirm before citing. Data lives in `public/data/vc-universe.js`; logic in `public/apps/fundraising/vclens.js` and `universe.js`.

## 1. The core idea: can this company return the fund?

Required exit = fund size x target multiple / ownership at exit. Ownership at exit = entry ownership x (1 - dilution to exit) [formula: https://vcbeast.com/math-behind-vc-returns-entry-to-exit, https://harlem.capital/can-your-startup-return-the-fund-6e233bd5c8b2/].

Dilution: median seed sells ~18-19.5%, median A ~17.9% (Q1 2025, down from 20.9%) [measured, Carta: https://carta.com/data/linkedin-seed-dilution-30-percent-under-10/ , https://carta.com/data/linkedin-vc-round-data-2025-valuations-dilution/]; under 10% of seeds sell 30%+. Seed to exit across ~4 later rounds retains ~45-60% without pro rata (0.82^4 = 0.45) [design arithmetic] so `DILUTION_TO_EXIT = {pre-seed 0.6, seed 0.5, series-a 0.4}`.

Minimum exit for ONE company to return the fund (1x), 10% entry, ~50% retained = 5% at exit [design, computed]:

| Fund | At 5% exit stake | At 10% exit stake (high-ownership lead) | Returns 3x the fund (5%) |
|---|---|---|---|
| $10M nano | $200M | $100M | $600M |
| $50M micro | $1.0B | $500M | $3.0B |
| $100M | $2.0B | $1.0B | $6B |
| $250M | $5B | $2.5B | $15B |
| $1B | $20B | $10B | $60B |
| $5B | $100B | $50B | n/a |

Note the often-quoted "$50M fund needs a $500M exit" assumes 10% **at exit**, i.e. ~20% at entry. Games must be explicit which one they use.

Venture-scale test: credible bottom-up path to ~$100M ARR in ~7 years (Lemkin, https://www.saastr.com/tam-is-great-but-what-really-matters-is-that-you-believe-you-can-hit-100m-in-7-years/); a company not in a ~$20-50B+ market struggles to reach $1B ARR (https://www.saastr.com/what-to-do-if-your-tam-is-too-small-for-vcs). $1B EV at ~10x ARR needs ~$100M ARR: 100 customers x $1M, or 10,000 x $10K, or 100,000 x $1K [design arithmetic].

A profitable $1-5M ARR SaaS growing 20% is a fine business with a ~$5-30M exit (3-6x ARR; private bootstrapped median ~4.8x, VC-backed ~5.3x, https://fungies.io/?p=40355 [secondary]; small Acquire.com deals 2.5-4x revenue, https://beancount.io/blog/2026/07/11/bootstrapped-saas-valuation-multiples-2026-acquire-com-indie-founders-guide [unverified]). For a $100M+ fund that cannot return the fund, so the answer is "great business, not venture-backable" even when profitable. That is why `EXIT_MULTIPLE_ARR.capped = [3,6]`.

Ownership targets (all [heuristic] from https://vcbeast.com/portfolio-construction-plan): pre-seed 5-10%, seed 7-15% (leads 10-20%), Series A 15-25%. Emergent Ventures (micro): sees 600-1,000 deals/yr, invests ~1%, targets 10%, realized median 12% [measured, one firm, https://getlatka.com/interviews/emergent-ventures-anupam-rastogi-2023]. If an oversubscribed or high-cap round means the allocation buys under target, the fund passes ("would love to follow") or asks for more allocation. Founders selling >30% at seed is disliked; <10% of seeds do it. [design] rule: needed check = target ownership x post-money; offered allocation under 70% of it flips to pass or a concession (`DECISION_RULES.allocationFloor`).

## 2. Fund tiers (what `FUND_TIERS` encodes)

Check, ownership, portfolio and reserve figures are [heuristic] (vcbeast, venturecapitalcareers); no audited per-tier dataset exists. Cold reply rates are [design], bracketed by "cold email to VCs gets ~1-5% replies, ~95% none" (https://founderscapital8.substack.com/p/cold-emails-to-vcs-have-a-95-non, secondary) and "warm intro: 25-50% meeting, 3-5x cold" (https://www.metal.so/collections/warm-intros-vs-cold-email-2025-conversion-data-referral-playbook, vendor blog). Funnel: ~1% of inbound is funded (Stanford GSB https://gsb.stanford.edu/insights/quick-study-how-think-venture-capitalist).

| Tier | Fund size | First check (seed) | Seed ownership [min, target] | A ownership | Leads | Cold reply | Warm meeting | Pedigree / TAM / traction weight | Decision days | Share of universe |
|---|---|---|---|---|---|---|---|---|---|---|
| top | $1-12B | $1.5-12M (seed program $1-3M) | 12-18% | 15-20% | 0.85 | 0.4% | 30% | .85 / .95 / .35 | 10-35 | 2% |
| established | $300M-1B | $2-6M | 10-15% | 15-22% | 0.75 | 1% | 35% | .6 / .8 / .65 | 18-50 | 7% |
| emerging | $100-300M | $1.5-5M | 9-15% | 12-18% | 0.6 | 2.5% | 42% | .55 / .65 / .6 | 10-40 | 20% |
| micro | $25-100M | $0.4-1.5M | 7-12% | n/a | 0.4 | 3.5% | 50% | .45 / .5 / .55 | 7-30 | 30% |
| nano / solo GP | <$25M | $75-300K | 2-8% | n/a | 0.1 | 4.5% | 55% | .35 / .35 / .5 | 3-21 | 24% |
| cvc | $50M-1.5B | $0.5-3M | 2-8% | 4-12% | 0.15 | 1.5% | 30% | .3 / .55 / .7 | 30-120 | 6% |
| family_office | $50M-2B | $0.25-2M | 1-5% | 2-6% | 0.1 | 2% | 40% | .5 / .45 / .45 | 14-90 | 5% |
| crossover | $2-15B | $8-40M | 5-12% | 6-15% | 0.6 | 0.3% | 22% | .7 / 1.0 / .7 | 7-30 | 3% |
| indie | $8-30M | $100-500K | 5-12% | n/a | 0.3 | 5% | 50% | .15 / **0** / .95 | 14-60 | 3% |

Sourced anchors: Sequoia seed ~$1-3M, A ~$8-12M (https://www.ellty.com/blog/seed-investors, secondary); a16z led ~46% of ~48 AI seeds studied in H1 2026, median lead check $10.5M (https://techflowpost.com/en-US/article/32240, secondary); Benchmark: equal partners, A/early B only, $10-20M for 15-25% (https://www.foundra.ai/vc/benchmark); a16z + Thrive + Founders Fund = 48.1% of new VC fund capital in H1 2026 and first-time fund formation is weakest since 2016 (PitchBook via https://www.venture360.co/resources/three-firms-raised-nearly-half-of-all-vc-capital); only ~15 genuine first-time $10M+ managers filed in June 2026 (https://vcbeast.com/how-emerging-managers-raise-a-first-fund); 2024 Carta fund mix ~42% of new funds are $1-10M (https://carta.com/data/newsletter-full-vc-fund-data/). Indie: TinySeed Fund 4 is $16M, 210+ SaaS companies (https://tinyseed.com/latest/16m-fourth-saas-fund-raise); TinySeed terms (10-12% equity, ~$120K) are low-confidence secondary; Earnest Capital 4 funds, 77 companies in 5 years, Shared Earnings Agreement (https://calmfund.com/writing/five-years); Calm Fund status conflicts (banner says "taking a break").

Herding and signal [design, qualitative support]: a top-tier lead makes a round oversubscribed within days; no recognised lead drags a raise 2-3x longer and lowers price. Hence `signal` is 1.8 for top, 1.0 for nano. A top-tier small seed check without follow-on is a negative signal for the next round [heuristic, no data].

Angels have no fund-returner math (`ANGEL_TIERS`): check sizes median individual ~$25K, pre-seed median fell $50K to $30K [measured, Carta 2023, https://carta.com/data/linkedin-angel-check-size-50k-to-30k/]; ~422,350 active US angels (UNH CVR 2023, https://walnutinvest.com/stats/angel-investing-statistics, secondary). Failure: 70% of angel investments return under 1x, ~10% of exits produce 85% of cash (Kauffman/ARI 2016-17); a different study found 39% lose money. Use deal-level ranges, not one number. Decision drivers (founder quality, warm intro, who-else-is-in) are [heuristic].

## 3. Market backdrop and AI era (`AI_ERA`)

| Fact | Value | Source |
|---|---|---|
| AI share of US VC deal value H1 2026 | ~86% ($355.9B of $412.7B) | PitchBook-NVCA via https://siliconangle.com/2026/07/09/pitchbook-us-venture-funding-hits-412-7b-first-half-ai-deals-dominate/ |
| AI share, Carta platform Q1 2026 | >60% | Carta via secondary (https://techjacksolutions.com/ai-brief/carta-ai-startups-59-percent-us-venture-h1-2026/) |
| Rounds >=$100M share of H1 2026 value | 87.5% | https://nvca.org/wp-content/uploads/2026/04/Q1-2026-PitchBook-NVCA-Venture-Monitor.pdf ; Q2 update |
| Active US VC firms | 2,984 (down from 3,054) | NVCA 2026 Yearbook https://nvca.org/press_releases/nvca-releases-2026-yearbook-charts-a-venture-industry-in-transition/ |
| Median software seed post-money | ~$24.3M (4.1M raised, 18% dilution), Jul 2026 | Carta via https://waveup.com/blog/seed-round-benchmarks/ [secondary] |
| AI apps seed | median $4.5M at $20M pre, 1,208 US rounds (Oct 2025) | https://carta.com/data/linkedin-hottest-startup-sectors-seed-2025/ |
| AI seed premium | **conflict**: ~42-45% (Carta 2024/early-2025: $19M vs $13M pre) vs ~4% (PitchBook-NVCA Q1 2026) | https://hub.causo.ai/guides/ai-startup-funding-this-quarter ; game uses 1.4x headline, range 1.04-1.45, only for genuinely AI-native decks [design] |
| Series A median | $49.3M pre (Carta Q3 2025); $62.0M (PitchBook Q1 2026); non-AI ~$55M (Carta Q1 2026); labels pre vs post conflict | https://hub.causo.ai/series-a-valuation-2026 [secondary] |
| Seed to A in 2 years | ~15-20% (2022 cohort 15.4% vs 30.6% for 2018) | Carta https://carta.com/data/linkedin-seed-to-series-a-light-at-tunnel-2025/ |
| Mega seeds | Thinking Machines ~$2B seed at ~$12B; AMI Labs $1.03B seed at ~$4.5B (Mar 2026) | https://techcrunch.com/2026/02/17/here-are-the-17-us-based-ai-companies-that-have-raised-100m-or-more-in-2026/ , https://altss.com/blog/march-2026-s-largest-startup-raises.md [secondary] |

The "$8-30M seed at $40-150M post for a pedigreed app-layer founder" band in `megaSeed` is a [design]/[heuristic] interpolation; no median is sourced and it must stay a rare tail (`oddsCap` 3%). Barbell: nine-figure pre-revenue AI rounds sit beside a ~$3.6M median seed.

Power law [measured, Correlation Ventures, 21,640 financings 2004-2013, https://lifescivc.com/2013/11/correlations-fresh-look-at-venture-capital-returns/]: ~65% lose money, 25% return 1-5x, 10% >5x, 4% >10x, 0.4% >50x. Seed to unicorn ~1-2.5% (AngelList 2021; Carta class of 2018 ~1.1%, https://www.saastr.com/carta-of-seed-funded-start-ups-fail-and-1-3-become-unicorns/). Q1 2026: removing the top 5 exits cut exit value 86.6%.

## 4. Sectors and venture scale (`SECTORS`, `SCALE_SIGNALS`, `SCALE_CLASSES`)

Heat is [design], loosely calibrated: AI 86% of dollars; cyber >$18B in 2025, +26%; defense 2.4x YoY on the narrow Crunchbase measure ($7.7B vs $3.2B; PitchBook broad >$48B) (https://news.crunchbase.com/venture/beyond-ai-growing-startup-sectors-legal-robotics-defense/); fintech $51.8B, +27% but below peak; climate $42.2B "well below peak"; consumer, edtech, marketplaces cooler (https://news.crunchbase.com/venture/funding-data-third-largest-year-2025/). Per-sector dollar share and specialist-fund counts were not found: `share` is [design]. Thesis-mismatch share of passes: ~25-40% [heuristic]; mismatch passes are fast, polite and avoidable.

Venture-scale class by structure [heuristic r4]: horizontal B2B with expansion and big verticals with embedded payments are venture-scale; small verticals (yoga studios, pet groomers) are capped under ~$30M ARR unless payments or a marketplace layer is added; Shopify/WordPress apps and Chrome extensions are platform-capped lifestyle; consumer subscription needs huge scale; AI wrappers on one model API are distrusted; services-as-software with agents is hot because TAM is labor spend. `SCALE_SIGNALS` encodes these as `cap` (max class, wins) and `floor` (min class).

## 5. Founder pedigree (`PEDIGREE`)

| Finding | Number | Source |
|---|---|---|
| Team cited as important | 95% of 885 VCs; single most important for 47% vs 37% business factors | Gompers, Gornall, Kaplan, Strebulaev; https://corpgov.law.harvard.edu/2019/08/20/how-do-venture-capitalists-make-decisions |
| Info that moves investors | Team info moves investors; not traction or existing lead on average; experienced investors respond only to team (AngelList experiment, ~4,500 investors, ~17,000 emails) | Bernstein, Korteweg, Laws, J. Finance 2017; https://www.gsb.stanford.edu/insights/shai-bernstein-what-really-matters-early-stage-investors |
| Prior success | 30% IPO/file rate vs 18-22% first-timers; prior FAILED founders ~20%, no better than first-timers | Gompers et al. JFE 2010; https://www.nber.org/papers/w12592 |
| Repeat founders | >50% of seed+A dollars, ~40% of rounds | Carta 2025; https://carta.com/data/linkedin-repeat-founders-majority-early-stage-capital/ |
| Elite schools | ~25% of US seed/pre-seed dollars to Stanford/Harvard/MIT alumni; top-7 schools ~half of $500K+ rounds to US-university founders | Crunchbase; https://news.crunchbase.com/venture/funded-founders-stanford-harvard-mit/ , https://news.crunchbase.com/venture/top-universities-funded-founders-2026-stanford/ |
| Same-industry experience | strongly predicts success; mean age of top 1-in-1000 growth startup founders 45 | Azoulay et al. https://www.nber.org/papers/w24489.pdf |
| Solo founders | 36.3% of new startups (H1 2025) but 14.7% of cash in priced rounds for ~30% of startups | Carta https://carta.com/data/solo-founders-report |

Multipliers (`meetingMult` none/some/strong/elite = 1/1.2/1.8/3; `roundMult` 1/1.1/1.4/2.5; `valuationMult` 1/1.05/1.25/1.8) are [design]: repeat founders receive ~1.25x their share of rounds in dollars (50/40), exit-plus-lab-plus-school stacks reach 'elite'. Prior failure gets no bonus (Gompers). Each tier's `pedigreeWeight` scales how much the multiplier counts: top 0.85, indie 0.15. Gaps: repeat-founder valuation premium, ex-FAANG/YC quantification, non-US penalties (none found). Seed score weights [design]: team 0.45-0.5, market 0.2-0.25, traction 0.2-0.25, product 0.1; later stage traction ~0.5.

## 6. How the game uses it

| Data export | Consumer | Behaviour |
|---|---|---|
| `FUND_TIERS` | vclens `fundReturner`, `ownershipCheck`, `lensFor`; universe generator | Fund size and ownership produce `needExit`; check bounds, cold/warm rates, decision days, tier weights |
| `DILUTION_TO_EXIT`, `EXIT_MULTIPLE_ARR`, `DECISION_RULES` | `fundReturner` | plausible exit = ceilingArr x multiple; ratio vs needed exit; soft penalty below 0.6, hard pass below 0.3 for institutional funds; angels and indie always ok |
| `SCALE_CLASSES`, `SCALE_ORDER`, `SCALE_SIGNALS` | `ventureScale` | text signals set max class (caps win), boosters set floors; deck market score moves within +/-1 class inside the cap |
| `SECTORS`, `GEOS`, `THESIS_TEMPLATES`, `NAME_PARTS` | universe `searchInvestors`, `lensFor` thesis fit | specialist sectors, heat as appetite multiplier, thesis text, fictional firm names (never real firms) |
| `UNIVERSE_COUNTS` + tier `shareOfUniverse` | `universeCount` | "~N investors match" scales populations by filters |
| `PEDIGREE` | vclens `pedigree`, `lensFor` | LinkedIn/bio regexes to points to tier, then meeting/round/valuation multipliers scaled by the investor's `pedigreeWeight` |
| `AI_ERA` | pricing, mega-seed gate | 1.4x AI premium for AI-native decks; mega seed only with elite pedigree + moonshot scale, capped at ~3% odds |
| `ANGEL_TIERS` | universe, angel lens | follow rate, FOMO pull, no returner math |

## 7. Operator quality in fundraising targeting (principle 7)

| Tier | What the player does | Expected effect [design] |
|---|---|---|
| Stellar | Reads the company's real ceiling (micro-SaaS, vertical, or moonshot) and targets funds whose size, thesis and ownership math fit it. Micro-SaaS and capped vertical: angels, operator angels, indie funds (TinySeed/Earnest-style), RBF, no top-tier time. Venture-scale: builds a bottom-up TAM, sequences warm intros to established/emerging leads, asks a cap that keeps the fund at its ownership target, uses the narrowed universe search to find thesis-matched funds, then lets a lead pull followers | Warm meeting 35-50%, 1 in 3-5 meetings advance; capped company closes a smaller round from the right capital in ~6-10 weeks; ~3x cold reply odds |
| Good | Matches stage and sector but ignores fund size, or sends solid cold emails to emerging/micro funds; asks a roughly right cap | Cold 2-4%, round closes but 1.5-2x slower, price 10-20% off best case; some "can't see it returning the fund" passes |
| Average | Broad generalist list, warm intros without checking thesis, asks the headline median valuation regardless of ownership math | Cold ~1%; ~25-40% of passes are pure mismatch; 3-4 months and low-quality followers |
| Mediocre | Sprays top-tier and crossover funds with a capped idea (Chrome extension, "for dog groomers"); asks a cap that breaks every fund's ownership math (allocation under 70% of target check); re-pitches mismatched investors; inflates the profile | Top-tier cold reply ~0.3-0.5%; hard returner pass (ratio under 0.3) at partner stage; burned list slots, rep damage, 100+ founder hours, the runway lost raising; no round closes |

Consequences are traceable: every pass has a reason code (ownership/allocation mismatch, market size, growth too slow, team gap, too early, check mismatch, conflict). Per r1, VCs name the true reason ~50% of the time (vague otherwise) [heuristic]. Stellar feedback: "a stellar founder would have targeted indie funds and angels for a ~$2M-ceiling product, or shown a bottom-up path to $100M ARR".

## Gaps and conflicts

True median SaaS acquisition price; Horsley Bridge primary stat (top 5% of deals ~60% of returns, unverified); sourced time-to-term-sheet (seed 3-8 weeks is [design]); per-tier firm counts and per-sector specialist counts; Carta median cumulative dilution seed-to-exit; AI seed premium (4% vs 42%); YC Demo Day valuations (unpublished, do not state); TinySeed/Calm current terms; angel group process lengths; Series A pre vs post label; Bessemer "Q2T3" unconfirmed. Many primary pages (Carta, ACA, speedrun.a16z.com) returned 403 or snippets only.
