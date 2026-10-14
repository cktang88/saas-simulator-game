# O3: Operator tiers for product and support sub-functions (2026, small startups)

Scope: sub-functions (1) customer discovery, (2) product prioritization and specs, (3) building with AI coding agents, (4) analytics, experiments and PMF measurement, (5) customer support.

Conventions: every number carries a URL and date. [design] = my estimate, not a sourced figure. [unverified] = secondary or vendor claim I could not check against the primary source. Research gaps are stated where they occur. The Pavilion, Gong and Booking.com searches returned no usable product or discovery data, so those spreads are [design].

---

## 1. Customer discovery and interviews (Mom Test)

**Tier behaviours**
- Stellar: opens with the customer's last real instance of the problem ("when did this last happen?"), asks what they tried and what it cost in time or money, and asks for something the customer must give up (a calendar slot, an intro, a pilot, a letter of intent). Ends every call with a specific next step or a no. Talks less than 30% of the time. Keeps a running tally of commitments versus compliments.
- Good: asks about past behaviour and uses follow-ups like "why?" and "what happened next?". Pitches rarely and only after the problem is confirmed. Gets some commitments but does not always push for them.
- Average: mixes past-behaviour questions with hypotheticals ("would you pay for...?"). Records praise as validation. Pitches in the first ten minutes. Rarely asks for a next step.
- Mediocre: leads with the product ("what do you think of this idea?"), asks "would you use this?", takes "that sounds great" as signal, and counts friends, family and warm contacts as interviews. Interview count is high, commitment count is zero.

**Outcome spreads**
- Share of interviews ending in a concrete next step (paid pilot, dated follow-up, intro): stellar 30–50%, average 5–15%, mediocre under 5% [design]. No public benchmark found; the Mom Test literature gives a qualitative standard only ([Mom Test summary](https://mtlynch.io/book-reports/the-mom-test/), undated).
- Validated-problem rate across a 20-interview round: stellar 12–15 of 20 describe the same painful, recent problem; mediocre cannot distinguish a problem from a preference [design].
- Skill vs luck: the spread is mostly skill in question design and mostly luck in who you can reach. Recruitment quality drives much of the outcome.

**Traps**
- Hypotheticals as evidence. "Would you pay $50?" produces noise. Past-tense questions produce data.
- Compliments as signal. "This is amazing" is free to say.
- Interviewing friends and warm network only, which inflates positives.
- Running 40 interviews without writing down a single commitment or changed decision.
- Demo-then-ask. The founder spends the call presenting and learns nothing.

**Detection**
- Question types in the transcript: past-tense versus "would you" or "will you". Count the ratio. A stellar operator's ratio is well above 2:1 past-to-future [design].
- Share of player talk time (a simulator can compute this directly).
- Presence of a specific ask in the last two turns and whether it was accepted, declined or dodged.
- Hard to game: the simulated customer's responses to "how much did that cost you last time?" should reveal whether the problem is real. A player can fake questions, but not fake consistent specifics across follow-ups.

**Feedback**
- Hypotheticals: "Ask what they did last time, not what they would do."
- Compliments: "Count the commitments, not the compliments."
- Warm-network-only: "Your friends will say yes. Find people who have no reason to be polite."
- Pitching early: "Get the problem in their words before you show anything."
- No ask: "Every call ends with a specific next step or a clear no."

**Sources**
- [Mom Test book report, mtlynch.io](https://mtlynch.io/book-reports/the-mom-test/), undated.
- [Koji Mom Test 2026 guide](https://www.koji.so/blog/mom-test-customer-interviews-2026), 2026.
- Commitment-strength rankings from a vendor blog: [skills.cat Mom Test summary](https://skills.cat/skills/wondelai/skills/mom-test). [unverified]

---

## 2. Product prioritization and specs

**Tier behaviours**
- Stellar: writes the problem, the user, the evidence (number of customers who asked or who churned over it), and a measurable outcome before any solution. Says no to most requests and records why. Kills features against a stated metric. Cuts scope to the smallest version that tests the assumption. Revisits priorities monthly against new evidence.
- Good: uses a scoring model (RICE or ICE) with real reach data. Writes acceptance criteria. Sometimes lets loud customers move the roadmap.
- Average: priorities follow the last sales call or the founder's intuition. Specs are feature lists. Acceptance criteria are vague ("works well"). Measures launches by shipping, not by outcome.
- Mediocre: builds "killer features", copies competitors, adds settings instead of removing friction, and writes outcomes like "increase engagement by 50%" with no baseline.

**Outcome spreads**
- Share of shipped features that move their target metric: stellar 40–60%, average 15–25%, mediocre under 10% [design]. No primary benchmark found. Pavilion's product-leadership data was not found; its published research is GTM-focused ([Pavilion Pulse Q4 2024](https://joinpavilion.com/resource/pavilion-pulse-report-q4-2024-public), undated in search).
- Forrester's 2025 survey: 37% of B2B C-level leaders report product-led priorities, against 11% of B2C ([Forrester via Pavilion-indexed search, 2025](https://www.forrester.com/report/b2b-organizations-are-three-times-more-likely-to-be-product-led/RES185066)). Context only, not a prioritization benchmark.
- Skill vs luck: scoping and kill discipline are skill. Market timing and competitor moves are luck.

**Traps**
- Feature-count productivity: many shipped items, flat retention.
- Roadmap by request volume. Loud customers are rarely representative.
- Specs with no outcome metric, so success cannot be judged afterward.
- Building the whole spec before testing the riskiest assumption.
- Adding settings and options when the real problem is onboarding friction.

**Detection**
- Specs in player output: does the spec name a user, a baseline number and an acceptance test? Score presence of each.
- Decision log: does the player record kills and the reason, or only additions?
- Timing: priorities re-ranked after new evidence, not only at quarter start.
- Hard to game: the sequence of decisions. A player who cites evidence for item A but builds item B first is visible.

**Feedback**
- "Write the outcome before the feature. If you cannot name the baseline, you cannot judge the result."
- "Your roadmap is a list of requests you said yes to. Write down what you said no to, and why."
- "Ship the smallest version that tests the assumption, then decide."

**Sources**
- [Pavilion Pulse Q4 2024](https://joinpavilion.com/resource/pavilion-pulse-report-q4-2024-public), undated in search; GTM-focused.
- [Forrester product-led data](https://www.forrester.com/report/b2b-organizations-are-three-times-more-likely-to-be-product-led/RES185066), 2025.
- Spread estimates: [design].

---

## 3. Building with AI coding agents (speed vs quality, testing, review, tech debt)

**Tier behaviours**
- Stellar: writes a spec and acceptance tests before prompting the agent. Scopes each task small enough to review in one sitting. Reads every diff. Requires tests that fail before the change and pass after. Tracks PR size and review time. Refactors duplicated code on purpose. Keeps a short list of known debt with owners.
- Good: uses agents for well-defined tasks, reviews diffs, runs tests and linters. Sometimes accepts large diffs when tests pass.
- Average: prompts for whole features at once, skims diffs, relies on the agent's own tests, and ships when the demo works.
- Mediocre: lets the agent run unsupervised for long sessions, accepts diffs without reading them, skips tests, and treats a green build as proof of correctness.

**Outcome spreads**
- METR randomized trial, 2025: experienced open-source developers took about 19% longer with AI tools, while believing they were about 20% faster ([eWeek coverage, July 2025](https://eweek.com/news/news-ai-tools-slow-developer-productivity-study); [Zvi review](https://thezvi.substack.com/p/on-metrs-ai-coding-rct)). Caveat: 16 developers, familiar repos, older tools. METR later reported that newer tools likely perform better; this is secondary coverage. [unverified]
- DORA 2025 (Google, September 2025): AI adoption among developers reached about 90% and AI acts as an amplifier of existing team quality ([Google blog, 2025](https://blog.google/technology/developers/dora-report-2025/)). Secondary reading: only some team clusters gained throughput without added instability ([Rob Bowley summary, Oct 2025](https://blog.robbowley.net/2025/10/01/dora-2025-ai-assisted-dev-report-some-benefit-most-dont/)). [unverified]
- Faros telemetry, 2025: high-adoption teams completed about 21% more tasks and merged about 98% more PRs, with review time up about 91% and bugs per developer up about 9%. Company-wide throughput and incident resolution stayed flat ([Faros via vendor FAQ, 2025](https://www.faros.ai/comparison/github-copilot-vs-codeium)). [unverified]
- Faros "Acceleration Whiplash", March 2026: incidents per PR up about 243% and bugs per PR up about 29% when moving from low to high adoption, within organizations; median review time up about 441% ([Faros report, March 2026](https://www.faros.ai/research/ai-acceleration-whiplash); [adtmag, April 2026](https://adtmag.com/articles/2026/04/22/more-code-more-bugs.aspx)). Vendor data, secondary numbers. [unverified]
- GitClear, February 2025: duplicated blocks rose roughly eightfold in 2024; refactored or moved lines fell from about 25% of changed lines in 2021 to under 10% in 2024 ([DevClass, 20 Feb 2025](https://devclass.com/2025/02/20/ai-is-eroding-code-quality-states-new-in-depth-report/)). [unverified: secondary summary]
- Estimated spread (tier outcomes after 3 months): stellar ships more features with defect rate near baseline; mediocre ships faster for 2–4 weeks, then incident and rework load grows [design].
- Skill vs luck: review discipline and test habits are skill. Codebase size and team tooling set a context-dependent ceiling.

**Traps**
- Demo-driven shipping: the feature works on the happy path, the edge cases fail in production.
- Large unreviewed diffs. Review time grows faster than output.
- Copy-paste generation instead of reusing existing functions. Debt compounds silently.
- Green tests written by the same agent that wrote the code, testing the implementation rather than the behaviour.
- Skipping the refactor step, so each agent session adds parallel code paths.

**Detection**
- Text signals: prompts that name acceptance criteria and failure cases versus one-line "build X" prompts.
- Decision patterns: does the player write or update tests before or after the agent's change? Does the player ask the agent to refactor or only add?
- Timing: PR size and time between PR open and merge. A simulator can model review time rising with diff size.
- Follow-through: incident-simulated events; does the player return to fix known debt?
- Hard to game: incident rate over time. Surface-level tests can pass, but rework appears in later sprints.

**Feedback**
- "Keep the diff small enough to read in one sitting. If you cannot review it, you cannot ship it."
- "Write the failing test first, then let the agent make it pass."
- "Ask the agent to find existing code before writing new code. Duplicates are debt."
- "A green build tells you the tests pass, not that the feature works."

**Sources**
- [eWeek METR coverage](https://eweek.com/news/news-ai-tools-slow-developer-productivity-study), July 2025; [Zvi on METR](https://thezvi.substack.com/p/on-metrs-ai-coding-rct), 2025.
- [Google DORA 2025](https://blog.google/technology/developers/dora-report-2025/), Sept 2025; [Rob Bowley summary](https://blog.robbowley.net/2025/10/01/dora-2025-ai-assisted-dev-report-some-benefit-most-dont/), Oct 2025.
- [Faros AI Acceleration Whiplash](https://www.faros.ai/research/ai-acceleration-whiplash), March 2026; [adtmag](https://adtmag.com/articles/2026/04/22/more-code-more-bugs.aspx), April 2026.
- [GitClear via DevClass](https://devclass.com/2025/02/20/ai-is-eroding-code-quality-states-new-in-depth-report/), Feb 2025.
- Gap: no sourced figure found for AI-agent test coverage or review rates. Searches returned academic PR studies only, with no overall acceptance rate. Tier spreads are [design].

---

## 4. Analytics, experiments and PMF measurement

**Tier behaviours**
- Stellar: defines the activation event and the retention metric before launch. Reads cohort retention monthly and checks whether the curve flattens. Runs a PMF survey (Sean Ellis) only on users who reached the core action. Pre-registers experiment hypotheses and sample size, and reports losing and inconclusive tests. Tracks gross revenue retention and net revenue retention separately.
- Good: tracks MRR, churn and activation weekly. Runs A/B tests but sometimes stops early. Survey run occasionally, not segmented.
- Average: has dashboards nobody reads. Reports vanity metrics (signups, page views). Declares winners after a few days. Runs PMF surveys on all users, including those who never activated.
- Mediocre: changes experiments mid-test, reports only winners, uses NPS as PMF, and reads a launch-week spike as product-market fit.

**Outcome spreads**
- Sean Ellis PMF test: 40% or more "very disappointed" is the usual threshold. Ellis describes the cutoff as derived from roughly 100 startups, where struggling companies stayed under 40% ([Koji 2026 guide](https://www.koji.so/docs/sean-ellis-test-product-market-fit), 2026; secondary). [unverified]
- SaaS Capital 2025 B2B retention benchmarks (over 1,000 private companies): NRR median near 102% in the $25k–50k ACV band; top quartile 111%, bottom quartile 97%. GRR medians roughly 90–95% across bands ([SaaS Capital, Sept 2025](https://www.saas-capital.com/wp-content/uploads/2025/09/RB32WS1-2025-B2B-SaaS-Retention-Benchmarks.pdf)). The quartile breakdown was read from a secondary summary. [unverified]
- Aleph × Benchmarkit 2026 (full-year 2025 data): median NRR 102%, median GRR 84% (secondary, no URL retrieved). [unverified]
- Experiment win rate: Optimizely analysis of about 127,000 experiments reports 12% winning on the primary metric ([Atticus Li summary](https://www.atticusli.com/blog/posts/experimentation-win-rate-myth-why-15-percent-normal/), secondary, date unclear). A separate Optimizely figure of about 20% average win rate is also cited. [unverified] Ronny Kohavi's Airbnb-era figure of about 8% (20 of 250 ideas) is cited in a podcast summary ([ABTasty, Kohavi profile](https://www.abtasty.com/blog/1000-experiments-club-ronny-kohavi/)). [unverified]
- Estimated spread for a small startup: stellar runs 2–4 experiments a month with 10–20% win rate and documents all; average runs more but reports 30% wins from early stops [design].
- Skill vs luck: test design and measurement discipline are skill. Traffic volume and seasonality set how much you can detect.

**Traps**
- Peeking and stopping early. False winners compound.
- Reporting only winners. Organizational memory becomes wrong.
- Using NPS or sign-ups as a PMF proxy.
- Averaging across segments, which hides the segment that has fit.
- Declaring PMF from a launch spike rather than retention curve shape.

**Detection**
- Experiment logs: is there a pre-stated hypothesis, sample size and stop rule? Does the player report losses?
- Metric choice: does the player name activation and retention or only top-of-funnel?
- Survey design: is the PMF survey filtered to users who used the core feature?
- Hard to game: the simulator can hold retention curves on a hidden model. A player who calls PMF without a flattening curve is detectably wrong.

**Feedback**
- "Write the stop rule before you launch the test. If you stop when it looks good, you measured noise."
- "Report the losing tests. The list of failures is where your learning is."
- "Run the PMF survey on people who used the core feature, not on everyone."
- "A flat retention curve matters more than one good week."

**Sources**
- [SaaS Capital 2025 B2B SaaS Retention Benchmarks](https://www.saas-capital.com/wp-content/uploads/2025/09/RB32WS1-2025-B2B-SaaS-Retention-Benchmarks.pdf), Sept 2025.
- [Koji Sean Ellis guide](https://www.koji.so/docs/sean-ellis-test-product-market-fit), 2026 [unverified].
- [Atticus Li on experiment win rates](https://www.atticusli.com/blog/posts/experimentation-win-rate-myth-why-15-percent-normal/), date unknown [unverified].
- Gap: no GrowthBook benchmark found; VWO's 2026 dataset (70% of experiments reach 95% confidence) is a different platform ([mean.ceo, 2026](https://blog.mean.ceo/?p=10254)) [unverified].

---

## 5. Customer support (speed, quality, AI agent setup, knowledge base)

**Tier behaviours**
- Stellar: answers within the target window on every channel and runs a weekly review of the 20 worst tickets. Writes help articles from actual ticket themes. Sets AI agent scope to the 10–15 most common intents, tests against past tickets, and defines a clear human handoff. Checks CSAT by intent. Tells customers about outages early.
- Good: responds quickly, has a knowledge base, uses templates with personalization. AI agent deployed with limited scope; handoff exists but is not tuned.
- Average: responds within a working day, knowledge base is outdated, AI agent answers everything including edge cases, CSAT is measured but not acted on.
- Mediocre: slow replies, canned responses that do not address the question, AI agent with no escalation path, and no monitoring of resolution quality. Treats resolution rate as the only KPI.

**Outcome spreads**
- First response, email: Zendesk tiers as cited by an aggregator: under 1 hour best-in-class, under 4 hours good, under 12 hours acceptable ([StealthAgents, 2025](https://stealthagents.com/research/customer-support-response-time-benchmarks-what-the-data-says-in-2025)). [unverified: secondary]
- First response, tickets: Freshworks Customer Service Benchmark 2025, median about one hour; top 20% about 3 minutes 10 seconds ([StealthAgents citing Freshworks, 2025](https://stealthagents.com/research/customer-support-response-time-benchmarks-what-the-data-says-in-2025)). [unverified]
- Live chat: median about 1 min 35 s (Comm100 2025), top about 10 s to 41 s depending on source ([same source](https://stealthagents.com/research/customer-support-response-time-benchmarks-what-the-data-says-in-2025)). [unverified]
- CSAT vs reply speed: LiveChat 2025 data reports CSAT peaking when the first reply comes within 5–10 seconds, and falling roughly 7 points per additional minute. [unverified, secondary]
- AI agent resolution rate: Intercom reported an average of about 66% across 6,000+ customers after Fin 3 (October 2025), with over 20% of customers above 80%; its product page lists 54% ([Createwith on Fin 3, Oct 2025](https://createwith.com/tool/intercom/updates/intercom-ships-200-updates-in-2025-fin-3-reaches-67-average-resolution-rate); [Intercom Fin page](https://intercom.com:443/fin)). Vendor-reported; Intercom itself warns resolution rate is not share of total work automated. [unverified]
- Customer preference: 55% of US adults surveyed in December 2025 had to escalate an AI-handled issue to a human, and 54% said humans delivered better service ([Liveops, Dec 2025](https://liveops.com/pr/ai-took-over-holiday-customer-service-in-2025-but-most-shoppers-still-preferred-humans-new-liveops-survey-finds/)). Holiday-shopping sample. Five9 reports 72% open to AI if escalation is easy ([CallCentreHelper, 2025](https://www.callcentrehelper.com/five9-research-consumers-open-ai-254181.htm)). [unverified]
- Estimated tier spread: stellar resolves 50–65% of volume with AI and keeps CSAT at or above baseline; mediocre sees 20–30% resolution with CSAT falling after deployment [design].
- Skill vs luck: knowledge-base quality and product complexity drive much of AI resolution. Operator discipline drives whether the number is real.

**Traps**
- Counting "deflection" (customer gave up) as resolution.
- AI agent with no handoff, so frustrated customers churn.
- Knowledge base written from the founder's view, not from ticket themes.
- Speed targets met by closing tickets without answering.
- Optimizing response time while ignoring CSAT by intent.

**Detection**
- Text signals: reply quality in the simulated support transcript (does it answer the question asked, does it cite the next step).
- Process: is there a weekly review of worst tickets? Does the player update the knowledge base after a repeated question?
- AI setup: scope list size, test against historical tickets, handoff trigger definitions.
- Timing: response time distribution, not average. Simulator can flag tails.
- Hard to game: CSAT by intent and repeat-contact rate. A deflected customer who returns within 48 hours is visible.

**Feedback**
- "Measure repeat contact, not just resolution. If the same customer comes back, you did not solve it."
- "Write the handoff rule before you deploy the agent. Customers who are stuck need a path to a human."
- "Turn the top five question themes into help articles this week."
- "Fast and wrong is worse than a little slower and right."

**Sources**
- [Zendesk 2025 CX Trends Report](https://www.zendesk.com/newsroom/articles/2025-cx-trends-report), Nov 2024 (no resolution-time benchmark in primary source).
- [StealthAgents response-time benchmarks](https://stealthagents.com/research/customer-support-response-time-benchmarks-what-the-data-says-in-2025), 2025 [unverified aggregator].
- [Createwith on Intercom Fin 3](https://createwith.com/tool/intercom/updates/intercom-ships-200-updates-in-2025-fin-3-reaches-67-average-resolution-rate), Oct 2025 [unverified].
- [Liveops Holiday 2025 survey](https://liveops.com/pr/ai-took-over-holiday-customer-service-in-2025-but-most-shoppers-still-preferred-humans-new-liveops-survey-finds/), Dec 2025.
- Gap: no primary Gorgias or Zendesk AI resolution-rate study found.

---

## Cross-cutting summary for the simulator

- Strongest detectable signals across all five: written evidence and a measurable outcome before action; a stated stop or kill rule; small scoped units of work; follow-through on the next step.
- Most reliable spreads (best-sourced): retention and NRR ranges (SaaS Capital 2025), support response tiers (aggregated, moderate confidence), experiment win rates (wide disagreement across sources, use a range).
- Weakest sources: Mom Test commitment rates, Pavilion or Gong product and discovery data (not found), AI coding tier outcomes (METR and Faros are contested and partly vendor-sourced). Use [design] values with an explicit confidence label in the simulator.
