# Early-stage discovery and PMF search by business segment

Scope: how customer discovery, MVP form, time-to-signal and retention differ by segment. Numbers are from web search (secondary sources, mostly 2025-2026) and are marked [unverified] where the primary source was not reached. Design assumptions are marked [design]. Not statistics.

## Cross-cutting facts

- Sample size for discovery: vendor and blog guidance clusters at 5-30 interviews per segment, with saturation (new interviews stop teaching anything new) as the stopping rule. No primary source gives a fixed count. [unverified] ([Echai](https://echai.ventures/startingup/customer-research/how-many-customer-interviews-do-i-need-before-i-trust-the-signal))
- PMF survey: Sean Ellis's "very disappointed" test uses a 40% threshold, from roughly 100 startups; Superhuman's write-up credits Ellis and shows the gain came from segmenting to the most-disappointed users ([Superhuman](https://blog.superhuman.com/how-superhuman-built-an-engine-to-find-product-market-fit/)). Ellis has called the cutoff somewhat arbitrary. Needs about 40+ respondents to be meaningful (guide claim, unverified).
- Time to PMF: a secondhand summary attributes ~2 years idea-to-PMF and 9-18 months from working product to PMF to a Lenny Rachitsky analysis of 24 B2B companies. Could not reach the original. [unverified] ([StealthAgents](https://stealthagents.com/research/startup-product-market-fit-statistics-2026))

## Segment by segment

### 1. B2B SMB SaaS (owner-operators)
- Who to talk to: the owner is the user and the buyer. Talk to 10-20 owners in the exact trade or niche.
- Pattern: 10-20 conversations usually show whether the pain is repeated [design].
- Real pain signals: they already pay for a patchwork (spreadsheet plus a tool), they have a named cost (lost jobs, late invoices), they ask when it ships.
- False positives: "This would be nice," compliments on the idea, free-tier signups that never log in, a friend-of-friend who likes you.
- MVP form: concierge or done-for-you service, then a single-feature tool. Waitlist is weak here.
- Time to first revenue: weeks, if priced low; [design] 1-3 months.
- Retention: SMB monthly logo churn is reported at 3-6.4% depending on source (Visionary Marketing: median SaaS churn 4.7%, SMB annual logo churn 31%; another analysis 6.4% monthly; Optifai N=939 gives 3-5%) ([Visionary](https://visionary-marketing.co.uk/blog/saas-churn-benchmarks-2026)). Figures differ about 2x across sources; treat as directional.
- Traps: low willingness to pay, churn when the owner's business dips, churn when the tool does not save visible time. Low WTP means founders over-discount and never learn the real price.

### 2. Mid-market B2B
- Who to talk to: the economic buyer (VP or director) plus a day-to-day user. Two or more people from the same account.
- Pattern: 15-25 conversations across 3+ accounts before a pattern is credible [design].
- Signals: a budget line exists, someone has tried and failed to buy a tool, a deadline (audit, renewal, growth target).
- False positives: a user who loves it but has no budget owner; "send me a proposal."
- MVP form: design partners (3-5 paying or pilot accounts), with written success criteria.
- Time to first revenue: 2-6 months [design].
- Retention: segment GRR typically sits between SMB and enterprise (secondary sources: 85-95%). [unverified]
- Traps: stalling at procurement, a single champion leaving, expanding scope before one use case works.

### 3. Enterprise B2B
- Who to talk to: the user, the champion, the economic buyer, and often security/procurement, who can block. Map all four early.
- Pattern: 20-30 conversations with the same role across several accounts; enterprise deals need 3+ accounts before a repeatable motion shows [design].
- Signals: an executive-sponsored initiative with a budget and a date; a current vendor being replaced for a named reason.
- False positives: a free pilot with no owner, champion without budget, "we'll revisit next year."
- MVP form: a paid pilot with written exit criteria, or a manual service for one account.
- Time to first revenue: 6-12+ months, including security review [design].
- Retention: enterprise GRR and NRR are higher (90-97% GRR and NRR above 110% are cited in secondary sources) [unverified].
- Traps, "pilot purgatory": open-ended pilots with no success criteria, sponsor, or purchase path. A reported "88%" pilot failure figure traces to a CIO article and vendor coverage, not a primary study ([CIO](https://www.cio.com/article/3850763/88-of-ai-pilots-fail-to-reach-production-but-thats-not-all-on-it.html?amp=1)). Treat conversion claims (e.g. "60-80% of good pilots convert") as unsourced.

### 4. Developer tools
- Who to talk to: the engineer who installs it, and the engineering lead who pays. Often different people.
- Pattern: 10-15 engineers in the target stack; watch installs and repeat use, not just interviews [design].
- Signals: people use it in production or CI, they hit a real limit, they ask about hosting or SSO.
- False positives: GitHub stars, Hacker News spikes, tweet engagement, tutorial makers. Commentary describes weak correlation between stars and revenue; one case has a 50k-star project struggling to monetise while a 5k-star project earns millions ([Monetizely](https://www.getmonetizely.com/articles/what-role-should-github-stars-play-in-your-open-source-pricing-strategy-7cd11)). A vendor guide estimates 1-3% of starrers are real buyers [unverified] ([Clarm](https://www.clarm.com/blog/articles/convert-github-stars-to-revenue)).
- MVP form: open source core, CLI or library, then hosted service.
- Time to first revenue: 3-12 months; open-source adoption often precedes paid.
- Retention: depends on usage; judge by weekly active repos or CI runs, not stars.
- Traps: stars as PMF, free-tier users who never reach the paid limit, building for the wrong buyer (individual vs team).

### 5. B2C subscription apps
- Who to talk to: the user is the buyer. Interview 15-20 users who recently had the job, not curious bystanders [design].
- Signals: repeated use, recurring trigger (daily or weekly), users pay before the paywall is pushed hard.
- False positives: launch-week downloads, novelty use, "I'd pay for this" in a survey.
- MVP form: app store launch or web app with a small paywall test; waitlist is weak evidence.
- Time to first revenue: weeks; app-store launches can monetise quickly.
- Retention: RevenueCat's 2026 State of Subscription Apps covers 115k+ apps and $16B revenue; median MRR growth 5.3%; only 4.6% of new apps reach $10k monthly revenue within two years ([Subscription Insider](https://www.subscriptioninsider.com/blog/revenuecat-data-shows-subscription-app-growth-concentrating-at-the-top-news)). Day-30 benchmarks vary: an AppsFlyer-based roundup puts Day 30 at about 2-15% by category; cross-industry average around 5-7% [unverified] ([Braze](https://www.braze.com/blog/mobile-app-retention-10-tip/)).
- Traps: novelty spikes that fade by Day 30; features that are fun but not habit-forming; paying for installs before retention is proven.

### 6. Prosumer tools
- Who to talk to: the individual who pays with their own money (freelancers, creators, solo operators). Ask about their current workaround.
- Signals: they already pay for adjacent tools, they share with peers, they upgrade voluntarily.
- False positives: free-tier praise, "cool" reactions, one-time purchase intent.
- MVP form: a single-player product with a free tier and a fast paid upgrade; waitlist plus cohort test.
- Time to first revenue: 1-3 months [design].
- Retention: monthly churn often sits between B2C and SMB [design].
- Traps: the individual loves it but cannot expense it, so price sensitivity is high and team expansion is slow.

### 7. Marketplaces
- Who to talk to: both sides, but one side first. NFX's Currier playbook says to find the harder-to-acquire side and build for it first ([NFX](https://nfx.com/marketplaces)). Full text unverified.
- Pattern: 10-20 supply and 10-20 demand conversations, then manual matching to test liquidity [design].
- Signals: the first side goes to other platforms to hunt for the other side; supply comes unprompted; repeat transactions.
- False positives: sign-ups without transactions, many listings without demand, one whale transaction.
- MVP form: manual matching (concierge), a single city or category, a standalone tool for one side.
- Time to first revenue: 3-9 months; first transactions often founder-made [design].
- Retention: repeat-transaction rate on each side, not logo churn.
- Traps: chicken-and-egg; liquidity claimed on a single geography; taking a fee before trust exists.

### 8. Vertical SaaS for traditional industries (construction, healthcare practices, legal)
- Who to talk to: the owner or practice manager plus the front-line user (office staff, field foremen). Stay in one niche for 30+ conversations [design].
- Signals: an existing manual process with a compliance or cash cost, a tool that every peer has, referrals within the niche.
- False positives: enthusiasm from non-buyers, pilots that run through a trade association.
- MVP form: done-for-you workflow, then software; trade-association or practitioner network distribution.
- Time to first revenue: 3-9 months; sales cycles longer and trust-led [design].
- Retention: slow adoption but sticky once embedded (Bessemer's vertical software lessons; not segment-specific numbers) ([Bessemer](https://www.bvp.com/assets/uploads/2022/07/bessemer_whitepaper_ten_lessons_vertical_software_investing_v2.pdf)). Healthcare founder accounts (e.g. Hint Health's early direct-primary-care wedge, ~80 doctors to ~1000 customers over several years) show the slow path ([SaaS Club](https://saasclub.io/podcast/zak-holdsworth-hint-329)).
- Traps: a long build before first sale, the wrong integration (EHR, accounting), a niche too small for the TAM founders need.

### 9. AI-native products (2026)
- Who to talk to: the owner of the workflow, plus the person who would have to trust the output. Interview on real tasks, with real data [design].
- Signals: users run the product on live work, not demos; they ask about data, audit trails, and integration; they expand usage.
- False positives: "Wow" demos, pilot use on sample data, free trial usage spikes, AI tourists trying the newest model.
- MVP form: a human-in-the-loop service, then automation; evals on real customer tasks.
- Time to first revenue: weeks for usage-priced tools; 3-6 months for enterprise [design].
- Retention: RevenueCat reports AI apps churn annual subscriptions 30% faster at the median; annual retention 21.1% vs 30.7% non-AI; AI apps monetise downloads ~20% better ([TechCrunch](https://techcrunch.com/2026/03/10/ai-powered-apps-struggle-with-long-term-retention-new-report-shows)). A ChartMogul-cited figure puts AI-native B2B GRR near 40% [unverified] ([Sandstone reference](https://getkapex.ai/blog/why-ai-apps-churn-retention-problem)).
- Traps: demo-to-production gap (integration, data, reliability, ownership); "AI tourists" who churn after novelty; features a model vendor can ship next quarter. Enterprise AI pilot failure figures (80-95%) come from contested studies and vendor blogs; use as a warning, not a rate [unverified] ([Hatchworks](https://hatchworks.com/blog/fde/why-ai-pilots-stall/)).

## Design implications for the sim [design]

- Discovery counts should differ by segment: SMB needs many cheap conversations; enterprise needs fewer, deeper, multi-role ones.
- False-positive signals should be tied to segment: stars for dev tools, downloads for consumer, pilots for enterprise, demos for AI.
- Retention curves should differ: SMB churn high and noisy, enterprise slow but lumpy, consumer front-loaded, marketplace liquidity-bound.
- Time-to-revenue ranges above should be sampled, not fixed.
