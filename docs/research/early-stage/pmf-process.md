# Early-stage PMF process: sourced facts for the simulator

Scope: idea, customer conversations, MVP, first customers, product-market fit (PMF), pivots. Confidence tags: **[verified]** = read at the source or matched by several sources; **[secondary]** = from a summary or blog, check before quoting; **[unverified]** = could not confirm; **[design]** = a sim design assumption, not a statistic.

## 1. How long PMF takes, and what it looks like

**Timelines**
- Lenny Rachitsky's analysis of 24 top B2B startups (interviews with 20+ B2B founders) reports a median of roughly **two years from idea to a first feeling of PMF**, and **9 to 18 months from a working product to PMF**. He calls ~2 years a point to start worrying, and ~3 years a point to worry seriously. A few companies took 4+ years. Source: https://www.lennysnewsletter.com/p/time-to-product-market-fit [secondary: read via search summary; paywalled sections not fully seen]
- Startup Genome's 2011 stage model (early web startups) puts discovery at ~5-7 months, validation ~3-5, efficiency ~5-6, and reaching scale at ~13-18 months, with founders underestimating validation time by 2-3x. Solo founders reportedly took ~3.6x longer to reach scale than two-founder teams. [secondary: blog summaries of the 2011 report; the original was not read]
- High Alpha's survey of startup CEOs found 19% expected PMF within 12 months, while the average reported time was 16-18 months. [secondary]
- Share of startups that never reach PMF: no reliable figure found. The closest sourced number is the CB Insights post-mortem study (101 failed startups): **"no market need" was the top cause at 42%**, ahead of "ran out of cash" (29%) and "not the right team" (23%). The sample is small and the study is from the 2017 post era; treat it as directional. [secondary: CMO Council and Angel Capital Association summaries of CB Insights]

**PMF signals**
- **Sean Ellis "very disappointed" test.** Ask users how they would feel if they could no longer use the product. If at least **40%** say "very disappointed" among users who still use it, the product likely has PMF in that segment. Ellis reportedly derived the threshold from comparing roughly 100 companies; the original dataset is not public in what was checked. Caveats: Ellis has called the 40% line somewhat arbitrary; it should be run per segment (a company-wide average can hide a ready segment); one practitioner view says the 25-39% band is "getting closer". Sample size guidance conflicts (about 40 responses is called directional; others say at least 40 for validity). [secondary: vendor and consultancy summaries]
- **Retention curve flattening.** The strongest behavioral signal is a cohort curve that plateaus above zero rather than decaying to nothing. Lenny's 6-month retention benchmarks by category are commonly quoted (consumer social, consumer transactional, consumer subscription, enterprise SaaS), but the summaries found disagree on the exact good/great numbers, so **do not hard-code them**. [unverified]
- **Pull, not push.** YC's 2016 essay by Michael Seibel (https://www.ycombinator.com/blog/the-real-product-market-fit/) gives qualitative signals and no numbers: customers buy as fast as you can produce, usage grows as fast as you can add servers, revenue accumulates quickly, you are hiring support and sales to keep up, the team is stretched keeping the product running, and customers are loyal and paying. It explicitly says headcount and big rounds are not valid signals. [verified]
- Sales cycle shortening, referral share rising, and customers escalating to ask for features they want to pay for are common practitioner signals. No quantified benchmark was found. [unverified]

**Levels of PMF** (nascent, developing, strong, extreme) appear in several frameworks and blogs, but no authoritative source was found for the level thresholds. Use as a rough ladder only. [unverified]

**False PMF signals** (what the sim should punish as misleading)
- Friends-and-family or free-pilot revenue. One team that gave the product away early got many requests from people with no real problem and no intent to pay; charging revealed who had the need. [secondary: OpenPhone/Quo posts]
- One large customer carrying the whole revenue line.
- Novelty spikes (launch day, Product Hunt, a viral post) that decay after the first cohort.
- Paid-acquisition-driven growth that disappears when spend stops.
- "Compliments" and "let me know when it launches" as evidence (see section 2).

## 2. The process strong founders follow

**Narrowing and problem selection**
- Start with a very specific segment and a painful, frequent problem, then widen. Sequoia's "hair on fire" phrase describes customers who will adopt an imperfect product immediately; the Seibel essay says initial solutions are likely wrong and should be iterated fast. [verified, YC essay]
- Sequoia's Arc guide warns that the hair-on-fire path is usually crowded, so differentiation matters, not just speed. [secondary]

**Design partners**
- No sourced standard for count, selection, or commitment was found. A sensible [design] default: 5-10 design partners in one narrow segment, chosen because they have the pain now, a named owner, and a current workaround. Commitments: a scheduled weekly feedback call, data access, and a paid or price-anchored pilot. Free-only partners are the false-signal trap above.

**Concierge and do-things-that-don't-scale**
- Founders do the work by hand before automating: manual onboarding, Wizard-of-Oz features, personal sales. YC's Startup School first-customers lesson stresses founders handling sales personally and charging from the start. [secondary: summary of Startup School lesson]

**Commitment over opinion (The Mom Test)**
- Compliments and hypotheticals are cheap for a customer to give. The recommended close is a concrete commitment with a cost: time (a follow-up or trial), reputation (an introduction to a decision-maker), or money (pre-order, deposit, letter of intent). [secondary: Rob Fitzpatrick book summaries]
- Tension noted by a critical review: the book warns against pitching yet asks for commitment to a next step. [secondary]

**Charging early**
- Multiple founder accounts say charging, even a small amount, separated real need from politeness. The sim should treat unpaid "interest" as weak evidence. [secondary]

**Interview counts and cadence**
- No peer-reviewed or primary-sourced interview count was found. The sim needs its own numbers, marked as design:
  - [design] Before building: 20-30 problem interviews across 2-3 candidate segments, at 3-5 per week, with a written hypothesis per interview.
  - [design] During search: 3-5 structured conversations per week, with at least one commitment ask per conversation.
  - [design] Kill rule example: if after ~30 conversations in one segment fewer than 3 people accept a paid or time commitment, narrow or pivot.

**Hypothesis-driven founders and pivots: RCT evidence**
- Camuffo, Gambardella and coauthors ran randomized field experiments on a "scientific approach" training (framing problems as hypotheses and testing them). Results, as read from the sources:
  - Earlier version (2017 working paper, Italian startups): 116 firms; trained founders performed better and pivoted more, but did not drop out less early. [secondary, CEPR working paper]
  - 2020 field experiment: 250 nascent entrepreneurs in a pre-acceleration program; trained founders' sharper valuation forecasts raised the chance of closing their startups, and they saw higher-payoff opportunities and pivoted to them. Pivot direction is positive here. [secondary: arXiv/CEPR summaries]
  - 2024 replication and extension: **759 firms across 4 RCTs**. The scientific approach was teachable, and it produced **fewer pivots**, associated with higher performance, via methodic doubt (more caution) and efficient search (better information). A nonlinear reading is that treated firms made few pivots rather than none or repeated ones. The journal is reported as Strategic Management Journal, but this was not verified. [secondary; see https://cepr.org/publications/DP15972 for the discussion paper, which was not readable in the fetch]
  - Takeaway for the sim: hypothesis-testing improves outcomes, and the pivot effect is not "more pivots is better". Early pivots, made after evidence, were not penalized; repeated pivots without evidence should be. Gambardella's comment that firms pivoted early and that this was "not necessarily a bad thing" fits this.

## 3. 2026 specifics

- **Cheap building, expensive validation.** AI coding agents make a first version fast, so the failure mode shifts from "cannot build it" to "build too much before validating". Practitioner writing describes a validation bottleneck that persists even as building speeds up. [secondary, 2025-2026 blog posts; no quantified study found]
- **Synthetic users and AI personas are a trap as evidence.** A 2025 arXiv study (https://arxiv.org/html/2509.02605v1) compared interviews with 15 early-stage founders against LLM founder and investor personas. The AI personas amplified false positives and missed negative historical experiences. The authors position personas as a complementary simulation, not a substitute. [verified abstract-level via search summary; read before quoting]
- **Investor and accelerator expectations pre-PMF.** Accelerators such as YC emphasize early customers, charging, and weekly growth signals over headcount or large rounds. [secondary; check the current YC library before quoting specific 2026 requirements]

## 4. Measurable benchmarks for the sim

| Quantity | Value | Confidence |
|---|---|---|
| Idea to PMF, B2B | median ~2 years; 9-18 months from working product | secondary (Lenny) |
| Idea to scale, early web (2011) | 13-18 months | secondary (Startup Genome) |
| Very disappointed threshold | 40% of current users, per segment | secondary (Ellis) |
| 25-39% very disappointed | "getting closer", not PMF | secondary, weak |
| Top failure cause | no market need, 42% of 101 post-mortems | secondary (CB Insights) |
| Second and third causes | ran out of cash 29%, wrong team 23% | secondary (CB Insights) |
| Scientific-approach RCT scale | 759 firms, 4 RCTs; fewer pivots, higher performance | secondary (Camuffo et al.) |
| Retention "good/great" 6-month bars | conflicting figures across summaries | unverified; do not hard-code |
| Interviews before build, per segment | 20-30 | [design] |
| Interviews during search | 3-5 per week, one commitment ask each | [design] |
| Design partners | 5-10 in one segment | [design] |
| Interview-to-design-partner conversion | not found | [design] start at ~10-20% for a cold list, [unverified] |
| Design-partner-to-paid conversion | not found | [design] start at ~50% for partners with a named owner, [unverified] |
| Time to first revenue | no sourced distribution found; use 1-6 months for a B2B pilot as a [design] default | [design] |

**Sim implementation notes**
- Score PMF with the Ellis test only on users who still use the product; show the segment split.
- Retention curves: reward plateaus above zero; punish decay to zero regardless of acquisition spend.
- A commitment ask that is not accepted should lower the interview's evidentiary weight, not just the mood.
- Every mistake has a traceable cost: building before interviews wastes weeks (time and money); pivoting without evidence burns the list and reputation; charging nothing keeps false demand alive.
- Model good founders as more likely to get PMF, not guaranteed to.

## Open items
- Original Ellis, Camuffo 2020 and 2024 papers, and Lenny's full benchmark table were not readable in this pass; verify before quoting exact numbers.
- Design-partner and pilot-to-paid conversion benchmarks were not found in any source; the [design] values above need a dedicated search.
