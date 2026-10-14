# O1: Sales and Customer Success operator quality (2026, small startups)

Scope: stellar / good / average / mediocre operators in five sub-functions. Conventions: [design] = our estimate for simulator tuning; [unverified] = secondary or vendor-blog claim we could not trace to a primary publication. Dates are publication or sample dates. Most cold-email and conversion numbers come from vendor data with inconsistent definitions, so treat them as ranges, not standards.

Headline caveat: the strongest primary sources found were Bridge Group (SDR, Feb 2025), Gong Labs discovery-call research (519k calls), Ebsta/Pavilion 2025 GTM Benchmarks (Apr 2025), SaaS Capital 2025 retention benchmarks (Sep 2025), and Expandi LinkedIn data (May 2025 to Apr 2026). Gainsight, Bain and KeyBanc primary 2025 customer-success numbers were not retrieved.

---

## 1. Prospecting and list building

**1. Tier behaviours**
- Stellar: defines an ICP with 3 to 5 firmographic and trigger filters (e.g. "raised Series A in last 6 months", "hiring 2+ SDRs", "uses competitor X per BuiltWith or job posts"). Writes a one-line reason each account is on the list. Keeps a list of 50 to 150 accounts per rep per week and drops accounts that fail a trigger check. Tests one new segment per sprint against a control. Checks list quality by bounce and wrong-persona rate before sending volume.
- Good: ICP written with firmographics, sometimes a trigger. Enriches with Apollo, Clay or Sales Navigator. Segments lists by persona. Cleans bounces before sending. Refreshes lists monthly.
- Average: ICP is a job title plus company size. Buys or exports a broad list, sends to everyone with the title. Rarely removes dead accounts. Lists grow faster than they are worked.
- Mediocre: "anyone in SaaS" or "all marketing managers". Lists bought from a list broker with no enrichment. Uploads 5,000 contacts to a sequencer without verifying emails, then wonders about spam placement.

**2. Outcome spreads**
- Account-to-meeting conversion and reply quality vary far more than list size. We have no primary benchmark for list-quality tiers. [design] Stellar lists yield 2 to 3x the positive-reply rate of broad lists at equal send volume, a spread the simulator should use.
- Bounce rate: keep under 2% (common deliverability guidance, [unverified], Instantly/Lavender-type vendor blogs, 2025 to 2026). Above 5% signals a bad list, not a copy problem.
- Skill vs luck: list quality is mostly skill (ICP and trigger discipline). Reply-rate variance within a small sample (under 500 sends) is mostly luck.

**3. Traps**
- Volume as a proxy for pipeline: sending 2,000 emails a week to a list that is 40% wrong-persona. Looks productive, damages sender reputation.
- Adding "nice to have" accounts to hit a list number, so the team's reply rate drops and the domain gets flagged.
- Never removing accounts that did not respond after 3 touches, so sequences keep re-hitting the same people.
- Buying a list with no signal, so the first 3 months of outbound are used to learn who the ICP is.

**4. Detection**
- Simulator can read the player's written ICP: number of filter criteria, whether a trigger/timing signal is present, whether a reason-per-account field exists.
- Decision patterns: ratio of accounts researched vs accounts added; whether the player removes or disqualifies accounts; whether they test segments in parallel.
- Hard to game: asking for a "list of 500 CTOs in fintech" without a reason is detectable because nothing ties it to a trigger. Gaming is possible by writing a fluent ICP paragraph, so judge by subsequent list choices.

**5. Feedback**
- Stellar to mediocre: "Your list has a reason for every name. Yours has a title. Add one trigger and drop anyone who fails it."
- "Bounces above 5% mean you do not have a list problem to fix with copy. Verify before you send."
- "Work your best 100 accounts before adding 1,000."

**6. Sources**
- Bridge Group, 2025 SDR Models and Metrics Report, published 6 Feb 2025, n=351 B2B companies: https://www.bridgegroupinc.com/research/2025-sdr-models-metrics-report-the-bridge-group
- Instantly 2026 benchmark, covering 2025 data (via secondary summaries, [unverified]): https://mailshake.com/blog/cold-email-response-rate/
- Bounce thresholds: [design] and common guidance, no primary source retrieved.

---

## 2. Cold email and LinkedIn outreach

**1. Tier behaviours**
- Stellar: writes 60 to 120 word emails with one specific, researched observation in the first line that could not be sent to a different company. One clear, low-friction ask (e.g. "worth a 15-minute look?"). Runs 4 to 6 touches over 2 to 3 weeks across email and LinkedIn, each adding a new angle. Tests subject lines and first-line types in A/B splits of at least 100 sends. Reads replies for objections and rewrites the sequence weekly.
- Good: personalised first line from a trigger, one ask, 3 to 4 touches. Measures reply rate per sequence. Uses LinkedIn for a profile check, not a pitch.
- Average: templated opener with a name merge tag and a company merge tag. Long feature-list emails. 2 touches, then stops. Mostly uses open rate as the success metric.
- Mediocre: sends the same template to 500 people. Opens with "I hope you're well". Pitches features in paragraph two. Sends the same email 7 times to one person, or sends LinkedIn connection requests with a pitch attached. Uses a sales tool's AI SDR with no review of output.

**2. Outcome spreads**
- Cold email reply rate (all replies, Instantly 2026 report covering 2025 data, via secondary summary): platform average about 3.4%, top quartile about 5.5%, top tier above 10.7% [unverified, secondary summary of Instantly's report; the report itself was not fetched].
- Lavender benchmark (231,818 emails to 4 Feb 2026, article dated 30 Mar 2026): A-graded emails show about 58% higher reply rate in Operations (5.4% for A-grade) and 79% lift in Finance (only 6.1% of emails earn an A grade). Technical departments show about 5.2%. This suggests the stellar/mediocre gap is roughly 2 to 3x in reply rate on the same list.
- Belkins (7.5M emails, 2025 data, via secondary summary): overall average about 0.45% for positive or unique replies by its definition, which is far lower. The definitions differ, so compare only within a source.
- LinkedIn (Expandi, 13.2M requests, May 2025 to Apr 2026): acceptance 28.5%, connection-note reply 3.0%, message reply 10.4%.
- Belkins LinkedIn via Expandi: acceptance 26.42% with a personalised note vs 26.37% without. Replies 9.36% with note vs 5.44% without. Note acceptance is flat, but note replies are about 72% higher.
- Skill vs luck: sends under 300 contacts produce noisy reply rates. Stellar operators are identifiable over 3 or more sequences, not one.

**3. Traps**
- Adding a 9th touch with the same message: adds no replies, raises spam complaints, lowers domain health.
- Tuning subject lines on 20-send tests and declaring a winner.
- Treating "opened" as engagement. Open rates are unreliable after Apple Mail privacy changes [design, widely known].
- Sending AI-written generic personalisation ("I noticed you're passionate about growth") that prospects recognise.
- Running 3 sending domains on the primary domain, so one bad week damages the company's main email.

**4. Detection**
- Simulator can read the drafted email: word count, number of specific nouns tied to the prospect, presence of a single ask, presence of a generic opener.
- Timing and follow-through: number of touches, days between them, whether the player responds to a reply or a bounce.
- Player-specific: whether the player tests more than one variant and reports numbers. Hard to game: a template with the prospect's name and company is detectable as template-only because the same body repeats across recipients.

**5. Feedback**
- Stellar to mediocre: "Your first line could be sent to any company. Replace it with something only this company would recognise."
- "Three touches with the same ask is one touch repeated. Give each touch a new reason."
- "Your LinkedIn connection requests are pitches. Send a request with no note, then a short message after acceptance."

**6. Sources**
- Instantly 2026 cold email benchmark (secondary): https://mailshake.com/blog/cold-email-response-rate/ (date of secondary summary: 2026)
- Lavender, cold email benchmark report, 30 Mar 2026: https://www.lavender.ai/blog/the-cold-email-benchmark-report
- Belkins 2025 cold email data, via secondary summary [unverified]: https://mailshake.com/blog/cold-email-response-rate/
- Expandi, LinkedIn Outreach Benchmarks 2026, covering May 2025 to Apr 2026: https://expandi.io/blog/linkedin-outreach-benchmarks-2026/
- Gong "top reps get 4.2x more replies" claim is secondary and not verified [unverified].

---

## 3. Discovery calls and demos

**1. Tier behaviours**
- Stellar: opens by stating what they learned from research and the purpose of the call in one sentence. Asks 11 to 14 targeted questions across the call, not front-loaded [Gong Labs, 519k calls]. Asks for the cost of the problem in dollars, hours or missed revenue, and asks what happens if nothing changes. Asks about the decision process (who else needs to agree, what the timeline is, what would stop the deal). Gives the prospect most of the talk time. Ends with a concrete next step and a date, and writes a recap email within 24 hours.
- Good: uses a pre-written question set, covers pain, process and timeline. Demos only the features tied to the stated pain. Asks for next steps but accepts vague ones.
- Average: opens with a company intro and a 10-minute product walkthrough. Asks "what are your pain points?" and writes down the answer. Ends with "let's stay in touch." Demos every feature.
- Mediocre: demos in the first call with no discovery. Talks for most of the call. Never asks about budget, timeline or other stakeholders. Sends a generic follow-up "just checking in". Lets the prospect define the demo agenda without qualifying.

**2. Outcome spreads**
- Gong discovery research (519k recorded calls, article first published 5 Jul 2017, last modified 4 Mar 2026): 11 to 14 targeted questions correlates with the greatest success. Speaker switches correlate strongly with success (no numeric values retrieved).
- Gong second-hand figure: won deals average about 57% rep talk vs 62% on lost deals, from a 326k-call analysis [unverified, secondary write-ups].
- Pricing discussed on the first call: reported 42% win rate vs 5% when price never comes up [unverified, secondary write-up of Gong Labs data on 11,331 opportunities]. Treat as direction, not number.
- Ebsta/Pavilion 2025 GTM Benchmarks (published Apr 2025, $48B pipeline, 655k opportunities, 240k minutes of discovery calls): top performers close about 11x faster than lower performers, up from 8.9x in 2024. When decision-makers are involved in the first two stages, win rates rise by 55% (vendor press release, Apr 2025).
- Demo-to-close: vendor blogs give 15 to 30%, with a planning figure of about 20% [unverified, multiple vendor blogs, 2025 to 2026].
- Skill vs luck: fit of ICP and budget status is mostly luck on a single call. Question quality and next-step discipline are skill and show up across 10 or more calls.

**3. Traps**
- Demo-first sales: the demo becomes a feature tour and the prospect does not state a problem worth solving.
- Over-asking: beyond about 14 questions the call feels like an interrogation, especially with C-suite (Gong note that too many questions harms C-suite calls).
- Recap emails that restate the product, not what the prospect said. Prospects do not reply.
- Taking "let's circle back in Q1" as a next step and leaving it in the pipeline at a stage it does not belong in.
- Demo-as-audition: the team spends 2 hours on custom demos for prospects who never named a budget.

**4. Detection**
- Simulator can read the player's call plan or transcript: count of questions, share of questions about money, timeline, stakeholders and status quo; whether a dollar figure is requested.
- Talk ratio is inferable from transcript length per speaker where the simulator has dialogue.
- Follow-through: time from call to recap, presence of a dated next step, whether the recap quotes the prospect's words.
- Gaming: a script that lists the right questions is detectable by whether the player follows up on answers. Ask the simulator to check that a follow-up question references a prior answer.

**5. Feedback**
- Stellar to mediocre: "You asked 3 questions before the demo. Ask 11 to 14 and let the prospect talk."
- "You never asked what this costs them today. Ask it in dollars and hours."
- "A recap that says 'great call' gets no reply. Quote their timeline back to them and propose a dated next step."

**6. Sources**
- Gong, "deal closing discovery call" analysis, 519k calls, article 5 Jul 2017, modified 4 Mar 2026: https://www.gong.io/blog/deal-closing-discovery-call
- Ebsta and Pavilion, 2025 GTM Benchmarks, Apr 2025: https://www.ebsta.com/news-updates/ebsta-unveils-2025-gtm-benchmarks-report/
- Talk-ratio and pricing-timing figures: secondary write-ups, [unverified].
- Demo-to-close ranges: vendor blogs (RevenueHero, Naoma, SaaS Hero), 2025 to 2026, [unverified].

---

## 4. Deal management, negotiation, closing (MEDDPICC and multi-threading)

**1. Tier behaviours**
- Stellar: keeps a MEDDPICC record on every deal (Metrics, Economic buyer, Decision criteria, Decision process, Paper process, Identify pain, Champion, Competition) and can name the gap in each. Multi-threads to at least 3 stakeholders by stage 2 (economic buyer, champion, technical or security). Writes a mutual close plan with dates agreed by the buyer. Pre-negotiates walk-away and discount authority before the proposal. Asks for a specific commitment (signature date, budget owner introduction) at each stage. Pulls deals out of forecast when a stage exit criterion is missed.
- Good: tracks deals in CRM with stage exit criteria. Knows the champion and the economic buyer. Discounts with a reason, usually in exchange for term length or a case study.
- Average: stage set by the rep's feeling. One contact per deal, usually a friendly user. Discounts early in the cycle when the buyer pushes. Forecast set by the rep on a gut level.
- Mediocre: 100% of pipeline in "commit". Deals with one contact for 90 days. Sends a proposal before any economic-buyer conversation. Discounts 20% to "close this week". Never removes a stalled deal from the pipeline.

**2. Outcome spreads**
- Ebsta/Pavilion 2025 (Apr 2025): 78% of sellers missed quota in 2025, up from 69% in 2024 (vendor press release). Top performers have win rates about 43% higher than others (secondary summary of same report) [unverified].
- Win rates fell from 2024 to 2025 per the same report (press release: -18% to -10% year-over-year, years are inconsistent across Ebsta posts).
- Stakeholder effect: decision-maker involvement in the first two stages lifts win rates by 55% (Ebsta, Apr 2025). A podcast summary reports win rates of 12% vs 40%+ with 6 or more stakeholders engaged early [unverified].
- Late-stage slippage: deals that slip more than two months at late stage see steep win-rate drops (Ebsta, Apr 2025, stated as 113% drop [unverified in magnitude]).
- Average B2B win rate 20 to 30% with best-in-class 35 to 40%+ [unverified, secondary].
- Skill vs luck: whether a deal has a real budget and timeline is largely luck. Multi-threading, mutual close plans and stage discipline are skill.

**3. Traps**
- "Commit" inflation: every deal has a verbal yes from one user. Forecast ends up 40% wrong.
- Discounting before the economic buyer has named a number. Gives margin away and signals the price is soft.
- Champion dependency: one friendly user carries the deal. When that person changes role, the deal dies.
- Proposal-first: sending pricing before pain, metrics and decision criteria are known. Creates a comparison with the cheapest vendor.
- Keeping stalled deals in pipeline to protect the number. Inflates coverage ratios and hides the real gap.

**4. Detection**
- Simulator can read the player's deal notes: presence of named economic buyer, number of distinct contacts, whether decision criteria are written, whether a dated mutual plan exists.
- Decision patterns: discount offered before a buyer-stated number, stage changes without a stated exit criterion, deals removed from forecast.
- Timing: days since last buyer contact per deal; late-stage deals with no meeting for two weeks are a flag.
- Gaming: a player can write MEDDPICC headings with vague content. Check that each field references a specific named person or date. Ask for the economic buyer's name and the decision date.

**5. Feedback**
- Stellar to mediocre: "You have one contact on a 90-day deal. Who signs? Have you spoken to them?"
- "You discounted 20% before they named a budget. Next time ask what they are prepared to pay before you discuss a discount."
- "Move the deal out of commit until the economic buyer agrees a close date."

**6. Sources**
- Ebsta and Pavilion, 2025 GTM Benchmarks, Apr 2025: https://www.ebsta.com/news-updates/ebsta-unveils-2025-gtm-benchmarks-report/
- Ebsta benchmarks portal: https://benchmarks.ebsta.com/2025-gtm-benchmarks
- MEDDPICC field definitions: practitioner framework, [unverified] (Force Management attribution in secondary sources not confirmed).
- Discount and forecast trap patterns: [design].

---

## 5. Customer success, renewals and expansion

**1. Tier behaviours**
- Stellar: defines success for each account in the first 30 days (a named metric and target, agreed in writing). Runs a quarterly business review with the economic buyer. Tracks product usage per account weekly and acts on drops within 7 days. Starts renewal conversations 90 to 120 days before the date. Identifies expansion by a usage trigger (seat or feature threshold hit) and proposes it with a value case in dollars. Builds a risk list reviewed monthly.
- Good: onboarding checklist, monthly check-in, renewal starts 60 days out, tracks NRR and GRR. Expansion ask is opportunistic.
- Average: check-ins happen when the customer emails. Renewal conversation starts 2 to 4 weeks before the date. Discounts at renewal when the customer threatens to leave.
- Mediocre: no defined success metric. Renewal conversation is a price negotiation the week before the date. Account only hears from the company when the invoice is sent. Never tracks usage. Churn is "a surprise".

**2. Outcome spreads**
- SaaS Capital 2025 B2B retention benchmarks (1,000+ private B2B SaaS companies, report Sep 2025): median NRR rises with ACV. For $25k to $50k ACV, median NRR 102%, top quartile 111%, bottom quartile 97%. GRR is highest in the highest ACV bands (sales cycle and implementation effects).
- Optifai 2026 pipeline study (N=939), via secondary summary: median NRR about 118% enterprise (ACV above $100k), 108% mid-market ($25k to $100k), 97% SMB (below $25k). Best-in-class above 130%, 120%, 110% [unverified, secondary].
- Gainsight framing (vendor blog, 2026): top-quartile NRR often quoted 115 to 120% [unverified].
- Gross retention for growth-stage SaaS, median about 87 to 90%, top about 93%+ [unverified, aggregator; not primary].
- Skill vs luck: churn driven by customer budget cuts and acquisitions is luck and context. Churn from low adoption is skill and visible in usage data.

**3. Traps**
- Renewal as a discount negotiation: teaches customers that the price is soft and trains them to wait for it.
- Expansion pitched as "more seats" with no usage evidence. Customers decline and the account is harder to expand later.
- Treating NPS or CSAT as health. A 9 from a champion who is leaving does not predict renewal.
- Over-serving low-ACV accounts with high-touch time. Mediocre operators spend time on the smallest customers and miss the at-risk large ones.
- Measuring logo count instead of NRR and GRR, so a company looks healthy while losing expansion revenue.

**4. Detection**
- Simulator can read the player's account plan: presence of a written success metric, a named economic buyer, a QBR date, and a renewal start date relative to renewal date.
- Usage: whether the player references a usage trigger when proposing an expansion.
- Timing: renewal conversation start in days before renewal; time to respond to a usage drop.
- Gaming: a success metric written generically ("increase value") is detectable. Require a number and a date.

**5. Feedback**
- Stellar to mediocre: "You started the renewal 3 weeks out. Start at 120 days and bring their usage data."
- "You offered a discount before they asked. Next time ask what outcome they are not getting yet."
- "Pitch expansion where usage has already hit the limit. Your ask then is about avoiding a block, not about buying more."

**6. Sources**
- SaaS Capital, 2025 B2B SaaS Retention Benchmarks (PDF, Sep 2025): https://www.saas-capital.com/wp-content/uploads/2025/09/RB32WS1-2025-B2B-SaaS-Retention-Benchmarks.pdf
- SaaS Capital retention benchmarks page: https://www.saas-capital.com/research/saas-retention-benchmarks-for-private-b2b-companies/
- Optifai 2026 study, via Fungies summary [unverified]: https://fungies.io/saas-valuation-statistics-2026-4/
- Gainsight CS metrics blog, 2026 [unverified framing]: https://www.gainsight.com/blog/customer-success-metrics-what-to-track-in-2026/
- Gross retention aggregator (StealthAgents) [unverified]: https://stealthagents.com/research/startup-gross-retention-benchmarks
- Primary Bain and Gainsight 2025 benchmark reports and KeyBanc 2025 survey were not retrieved; a follow-up is needed before using their numbers as anchors.
