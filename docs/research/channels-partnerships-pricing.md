# Partnerships, non-ad channels and SaaS pricing (2026)

Research date: 2026-10-14. Scope: everything **except** paid ads, SEO, launch platforms and B2C app economics (see [marketing-and-ads.md](marketing-and-ads.md)) and cold email/outbound sales process (see [sales-and-research.md](sales-and-research.md)). Machine-readable version: `public/data/channels.js` (`CHANNELS`, `PRICING_RESEARCH`).

Labels used: **(vendor)** means data from a company selling the tool or service; **[design]** means a game estimate bounded by the cited data, not a measured benchmark. Many channels have no rigorous public data; where that is so, it says so.

---

## 1. Partnership and channel acquisition

### 1.1 Affiliate programs
- **Tools (2026):** Rewardful ~$49–$149/mo (Stripe/Paddle-centric), FirstPromoter from ~$49/mo with no transaction fees (vendor claim), Tolt ~$29/mo (sources disagree on a transaction-fee model), PartnerStack custom pricing estimated ~$800–$5,000/mo (third-party estimates) ([CostBench 2026](https://costbench.com/compare/firstpromoter-vs-partnerstack/), [FirstPromoter blog](https://firstpromoter.com/blog/rewardful-alternatives)).
- **Commission:** Rewardful's sample of 250 programs ($68.4M revenue): ~22% average for small programs, ~24.5% for $1M+ programs (vendor, 2025-08, updated 2026-06) ([Rewardful](https://www.rewardful.com/articles/saas-affiliate-program-benchmarks)). Other guides: median ~20%, SMB tools 20–40% recurring, mid-market/enterprise 10–25% or $100–$500 bounties; most recurring programs cap at 12 months, ~20% pay lifetime (vendor, 2025) ([Quality Unit](https://cdn.qualityunit.com/blog/saas-affiliate-commission-rates)).
- **Share of revenue from affiliates** (Rewardful customers, vendor): AI/ML SaaS 15–25% of MRR, creator platforms 12–22%, B2B/HR tech 10–20%. This is a sample of companies that *chose* affiliates and use the tool — survivorship bias.
- **How many affiliates ever sell:** No reliable SaaS-specific figure found. Blogs claim the top 10% of affiliates generate 70–90% of affiliate revenue (method undisclosed) ([Quality Unit](https://cdn.qualityunit.com/blog/affiliate-marketing-industry-size-2025), [MEAN CEO](https://blog.mean.ceo/?p=10238)). Game: **[design]** 5–15% of recruited affiliates make ≥1 sale; top 10% produce ~80% of affiliate sales.
- **Cookie windows:** 30–90 days are the common settings in SaaS affiliate tools; 60 days is a common default **[design]** (no benchmark dataset found).
- **Fraud/abuse:** brand-keyword bidding, coupon sites claiming organic buyers, self-referral, fake signups on recurring commission. Mitigations: written prohibited-tactics terms, payout after the refund window, review of new-affiliate conversions ([track360 2026](https://track360.io/blog/saas-affiliate-fraud-detection-2026), [PayPro Global](https://payproglobal.com/answers/what-is-affiliate-fraud/)).
- **Solo founder execution:** 15–25 h setup; recruit 50–200 people already writing/recording about the category; personally activate the top 5–10; first affiliate sale typically 1–4 months after launch **[design]**.

### 1.2 Customer referral programs
- Participation estimates (vendor): 2–8% of active customers average, 10–15% in healthier B2B programs; asking after an aha moment and two-sided rewards raise participation (SaaSquatch/Gainsight figures as compiled by GrowSurf) ([GrowSurf 2026](https://growsurf.com/statistics/saas-referral-statistics/), [Cello](https://cello.so/?p=14760), [Prefinery 2025](https://www.prefinery.com/blog/10-key-referral-program-metrics-to-track-2025/)).
- Share of new customers: best-in-class 20–30% from referrals; GrowSurf customers ~1 in 5 new customers, ~15% of ARR (vendor platform data). Treat 5–15% as typical for a new program **[design]**.
- Rewards: account credits/extra usage reportedly beat cash; typical incentive 15–25% of first month/year value (vendor compilations).
- Referred customers: higher LTV (16–25%, ProfitWell via GrowSurf) and higher conversion — directionally consistent across sources, exact numbers unverified.
- K-factor context (typical 0.1–0.25) is in [marketing-and-ads.md §4](marketing-and-ads.md).

### 1.3 Integration marketplaces and app stores

| Store | Fee (2025–2026) | Review / gate | Discovery notes |
|---|---|---|---|
| Shopify App Store | 0% on first **$1M lifetime** revenue (counted from 2025-01-01), then 15%; 2.9% processing; $19 one-time registration | Official 5–10 business days; 2026 forum reports ~30 days | Search drives most installs (vendor claim); 4 in 5 of 22,546 apps have <10 reviews; top 1% earn ~72% of (estimated) revenue; cold start 0–2 organic installs/week with no reviews (anecdote) |
| HubSpot App Marketplace | No listing fee observed (apps bill directly) — verify | Certification: 6+ months listed and **60 active installs** (since 2024-05) | Certified badge and reviews drive placement |
| Salesforce AppExchange | Security review ~$999 per review for paid apps (older official page); historic rev share 15–25% by program | Security review, often multiple rounds | Enterprise; leads need enterprise sales |
| Atlassian Marketplace | Forge 16% (2026-04) → **17% (2026-10)**; Connect 20% → **25%**; 0% on first $1M lifetime Forge revenue for Runs-on-Atlassian apps (from 2025-10) | Marketplace approval | Atlassian bills; mature, crowded categories |
| Microsoft Marketplace (AppSource/Azure) | **3%** on transactable offers; free to publish | Certification | Enterprise buyers can use committed Azure spend |
| Google Workspace Marketplace | No listing fee | "Several days"; sensitive scopes need extra verification | Low browse traffic |
| Slack Marketplace | No fee found | Slack review guide | Low browse traffic |
| Zapier | Free; tiers by active users (Silver 50, Gold 350, Platinum 3,000) unlock directory leads/co-marketing | Integration review | Zapier claims partner users convert 3.5x (vendor marketing) |
| Chrome Web Store | One-time registration (historically $5, unverified for 2026); no rev share | Most reviews within days, up to weeks; **2026-08: 2 publication slots per publisher by default**, Featured self-nomination closed | Store search + ratings; ratings now weight recent reviews |
| ChatGPT apps (OpenAI) | No fee; **no in-chat digital goods/subscription sales at launch** | Submissions opened 2025-12-17; policy review | Name search + browse; no public install/conversion data |
| Claude Connectors Directory | No fee | Anthropic review for security/reliability, inclusion not guaranteed; remote MCP servers via admin portal; local servers via MCPB/Desktop Extensions or plugins | Directory inside Claude apps |

Sources: [Shopify revenue share](https://shopify.dev/docs/apps/launch/distribution/revenue-share), [Shopify changelog 2025-04](https://shopify.dev/changelog/update-to-shopifys-app-developer-revenue-share), [Shopify review times forum 2026](https://community.shopify.dev/t/shopify-app-review-time/32778), [RevenueHunt 2026-06](https://revenuehunt.com/state-of-the-shopify-app-economy/), [Indie Hackers 2026](https://www.indiehackers.com/post/my-shopify-app-sat-at-0-reviews-for-3-weeks-at-119-mo-i-just-made-it-free-heres-the-honest-math-92c5164580), [HubSpot changelog](https://developers.hubspot.com/changelog/active-install-requirement-increase-for-app-certification), [Salesforce security review fees](https://developer.salesforce.com/docs/atlas.en-us.242.0.packagingGuide.meta/packagingGuide/security_review_fees.htm), [Atlassian 2026 timeline](https://www.atlassian.com/blog/developer/extended-timelines-for-marketplace-revenue-share-changes), [Microsoft FAQ](https://learn.microsoft.com/en-us/partner-center/marketplace-offers/marketplace-faq-publisher-guide), [Google Workspace review](https://developers.google.com/workspace/add-ons/concepts/gmail-addon-review), [Zapier partner program](https://docs.zapier.com/platform/publish/partner-program), [Chrome review process](https://developer.chrome.com/docs/webstore/review-process), [Chrome 2026-08 update](https://developer.chrome.com/blog/cws-review-updates-2026), [OpenAI 2025-12](https://openai.com/index/developers-can-now-submit-apps-to-chatgpt/), [Claude directory docs](https://claude.com/docs/connectors/directory).

**Dynamics for the game [design]:** a new listing gets little organic traffic until it has reviews; ranking is driven by keyword match, then installs, recent reviews and retention. Install→paid for paid apps with a free trial 15–40%; free apps/extensions 0.5–3%. Ramp to steady state 6–18 months. Risk events: platform ships a native feature; fee changes (Atlassian 2026); review queue spikes from AI-generated submissions (Shopify and Chrome both reported higher submission volume in 2026).

### 1.4 Resellers, VARs, agencies, consultants, MSPs
- Margins: 20–40% healthy (vendor blog), reseller discounts 15–30% off list, lower on renewals; Microsoft Dynamics partners' median software margin 30.7% (Partner Economics) ([Monetizely](https://www.getmonetizely.com/articles/partner-discounts-amp-margins-how-to-structure-a-win-win-saas-reseller-program), [Reditus](https://getreditus.com/resources/glossary/value-added-reseller), [MSDW](https://msdynamicsworld.com/node/32239)). Extreme case: NetSuite SP 100 paid 100% of year-1 subscription then 10% recurring ([SMB Group](https://www.smb-gr.com/blogs-laurie-mccabe/netsuite%E2%80%99s-sp-100-program-an-offer-vars-can%E2%80%99t-refuse/)).
- Partner involvement lifts win rate ~11.7% on average (Crossbeam network data, vendor); partner leads 53% more likely to close than cold (Crossbeam 2023) ([Crossbeam](https://insider.crossbeam.com/entry/new-data-involving-partners-in-deals-increases-win-rate-for-nearly-every-ecosystem-size-and-type)).
- Ramp: no quantified public benchmark found. Game **[design]**: first partner-sourced deal 3–9 months after signing; ~1 in 3–5 recruited partners ever closes a deal; enablement 5–10 h/week per active partner during ramp.

### 1.5 Technology / co-marketing partnerships
Co-webinars, newsletter swaps, integration launch posts, joint templates. Mostly time (10–25 h per activity **[design]**). Works between companies of similar audience size; large partners rarely reciprocate for seed startups. Account-overlap tools (Crossbeam/Reveal) identify shared customers.

### 1.6 Strategic / distribution partnerships and OEM
Practitioner consensus: big-platform BD rarely pays at seed — slow procedural decisions, champions leave, signed deals go unpromoted; sell directly first ([Marvin Liao](https://marvinliao.medium.com/business-development-bd-partnerships-make-no-sense-for-most-seed-stage-startups-19794b724058), [KDT](https://kdtvc.substack.com/p/how-platforms-can-think-intelligently-about-early-deal-structure-bfa2dd92f4c7), [First Round/Cristina Cordova](https://review.firstround.com/podcast/partnerships-lessons-from-stripe-notion-cristina-cordova-on-creating-win-win-deals/)). No dataset on stall rates exists. Game **[design]**: 6–18 months to launch, 60–80% stall before launch; outcome distribution heavily skewed (most zero, rare large wins). OEM/white-label: wholesale 30–60% of list, concentration risk.

---

## 2. Other channels

### 2.1 Webinars and workshops
Registration→live attendance: Goldcast 40% (26,190 webinars, 2025 data), Contrast median 41.6%, ON24 57–60% (platform data, 2024–2025); ON24 average ~216–239 attendees (large-company skew) vs Goldcast ~51 ([Goldcast](https://www.goldcast.io/blog-post/2025-webinar-statistics-b2b-marketers-should-know), [MarketingProfs 2025](https://www.marketingprofs.com/charts/2025/52917/b2b-webinar-benchmarks-conversion-attendance-personalization)). A seed startup without a list: 20–100 registrants **[design]**. Registrant→paid 2–8% (SMB) **[design]**.

### 2.2 Events and conferences
10x10 booth: space $10k–$15k, all-in $10k–$50k; cost per lead $96–$881 (CEIR as cited by vendors); ~80% of trade-show leads never get follow-up (CEIR, via vendors); ROI shows 3–12 months later for B2B ([attnagency](https://www.attnagency.com/blog/trade-show-booth-design-lead-capture-optimization), [Cometly](https://www.cometly.com/post/trade-show-roi-measurement)). Speaking: free entry, CFPs 3–9 months ahead **[design]**. Solo founders: attend and book meetings instead of buying a booth.

### 2.3 PR
- Agency retainers: boutique $3.5k–$10k/mo; startup budgets $5k–$25k/mo; average digital PR contract ~$5.5k/mo; 6-month minimums common (agency sources, 2026) ([Everything PR](https://everything-pr.com/how-much-does-a-pr-agency-cost-in-2026), [Bridgehead 2026-08](https://www.bridgeheadcommunications.com/insights-txt/2026/08/17/b2b-tech-pr-agency-costs-2026)).
- Journalists respond to ~2.5–3.5% of pitches (Propel, ~400k pitches, 2024); pitches <150 words 5.9% vs >500 words 1.5%; Muck Rack 2025: 54% of journalists seldom/never respond ([EPR study](https://everything-pr.com/epr-research-and-5w-release-the-pr-pitch-response-rate-study-2026), [UMN on Muck Rack](https://umarcomm.umn.edu/blog/2025/12/15/muck-racks-state-pr-2025)).
- Coverage odds for a seed startup: no dataset. Game **[design]**: tier-1 tech outlet coverage of a seed round with a known lead investor 10–30%; product-only news without funding/data 1–5%; trade/niche outlets 20–50% with a good angle. Coverage spike lasts 1–3 days; signup yield 0–300 per piece.

### 2.4 Podcasts
Host-read CPM ~$18–$26 (Libsyn rate card 2026), $25–$40 (Acast guidance), last measured average $21.37 per 60s spot (Libsyn, 2024-09); US podcast ad revenue $2.86B in 2025 (IAB/PwC) ([Podder](https://www.podderapp.com/post/podcast-advertising-cpm), [Adopter](https://adopter.media/podcast-advertising-rates)). Guesting is free but slow (episodes publish 1–3 months after recording) **[design]**.

### 2.5 Newsletter sponsorships
CPM B2C $10–$30, B2B $50–$100, niche roles $100–$200+ (beehiiv); B2B SaaS direct $100–$150, programmatic $25–$40 (Dupple, vendor, 2026-05); sponsored CTR 1.5–4% on 1k–10k lists, 0.5–1.5% on 1M+ ([beehiiv](https://www.beehiiv.com/blog/newsletter-sponsorship-cost), [Dupple](https://dupple.com/blog/advertising-in-newsletters)). Open-rate inflation from Apple Mail Privacy Protection makes CPM comparisons unreliable.

### 2.6 YouTube and creators
Tech/B2B SaaS integration CPM $30–$60 (high-intent $50–$100+); dedicated video 2–3x; Shorts 40–60% of long-form; ~40k-sub tech creators $2k–$3k per integration; usage rights/whitelisting raise total deal value 2–3x (agency/vendor sources, 2026) ([CreatorsJet](https://www.creatorsjet.com/blog/how-much-do-brands-pay-for-youtube-sponsorships), [LaunchPoint](https://www.launchpointhq.com/guides/rates/how-much-do-tech-youtubers-charge)). B2C UGC rates: see marketing-and-ads.md §2.

### 2.7 Free tools, templates, directories, comparison pages
No dated, published conversion benchmarks for free tools; canonical examples are HubSpot Website Grader, Shopify generators, Ahrefs free tools ([MicroConf](https://microconf.com/latest/engineering-as-marketing)). In 2026, AI coding agents cut build cost to days, but AI answers also satisfy many tool-style queries directly. Comparison/alternatives pages are bottom-funnel and frequently cited by AI search. All volumes **[design]**.

### 2.8 Review sites
G2 free profile; Starter ~$299/mo; buyer-intent data ~$40k–$50k/yr (CostBench third-party, 2026-06) ([CostBench](https://costbench.com/software/review-management/g2/hidden-costs/)). Capterra/GetApp PPC: second-price auction, $2 minimum bid in $0.25 steps; competitive categories need $20+ for visibility; pay-per-lead $30–$100+ (third-party) ([Capterra PPC terms](https://capterra.com/legal/ppc-service-description/), [SpotSaaS](https://spotsaas.com/blog/capterra-advertising)). Review presence also matters for AI search: a vendor study found ChatGPT-cited B2B tools almost all had G2/Capterra reviews ([EPR](https://everything-pr.com/g2-owns-saas-buying-ai)).

### 2.9 Cold calling and direct mail
Cold calling: Cognism conversation→meeting 2.3% (2025) → 2.7% (2026); Belkins 2025: 9.9% of dials reach a live person, ~370 dials per meeting ([Cognism](https://www.cognism.com/cold-calling-report-2025), [Vida](https://vida.io/blog/cold-call-success-rate)). Full outbound model in sales-and-research.md. Direct mail: ANA/DMA average response ~4.4% (house list 5–9%, prospect 2–4%); postcard ~$0.58, letter ~$0.81, dimensional ABM $8–$50/piece (vendor summaries) ([firstsales](https://firstsales.io/blog/b2b-direct-mail-outbound), [directmail.io](https://directmail.io/blog/12-direct-mail-benchmarks-every-marketer)).

### 2.10 LinkedIn founder content and communities
LinkedIn organic reach fell ~47% (views) in 2025 and link posts lose 20–50% reach (see marketing-and-ads.md §4). Still the main free B2B awareness channel; works when it feeds DMs/outbound. Owning a community: no benchmarks; 6–18 months to become self-sustaining **[design]**; fails when it is "users of my product" rather than a professional identity.

### 2.11 AppSumo lifetime deals
Noah Kagan disclosed AppSumo revenue fell ~50% over two years (2026-02); reasons cited: AI makes software cheap to build, LTD trust damaged by vendor shutdowns, subscriptions are the norm ([PPC Land 2026-02](https://ppc.land/appsumos-revenue-crashes-50-as-lifetime-deal-model-faces-existential-crisis/)). Partner split varies by program; one founder (>$300k gross launch) reports AppSumo spends ~half on ads and the partner nets ~30% ([Indie Hackers](https://www.indiehackers.com/post/my-saas-made-400-000-in-its-first-year-heres-how-1649d7bcc7)); others cite 50–70% ([MySignature](https://mysignature.io/blog/appsumo-launch/)). Pitfalls: permanent support and **AI inference cost** for users who never pay again; deal-seekers ≠ ICP.

### 2.12 PLG loops
Collaboration invites and "made with" watermarks add to K-factor; typical total K 0.1–0.25 (see marketing-and-ads.md). Free→paid: ChartMogul × Kyle Poyar (200 B2B products, 2026-01): median 8%, bimodal; card-required trials ~30%; 62% use 14-day trials ([ChartMogul](https://chartmogul.com/reports/saas-conversion-report/)).

### 2.13 AI search optimization (GEO/AEO)
ThriveStack (100 SaaS brands, 50k queries, dataset 2026-08, vendor): 84.1% of AI citations come from third-party sources; top 5 brands per category capture 68.2%; ~74% weekly citation turnover in ChatGPT answers ([ThriveStack](https://www.thrivestack.ai/research/ai-visibility-benchmarks-2026)). Brand-owned sites ≈ 5–10% of AI sources (McKinsey via secondary). Traffic share and conversion uplift: see marketing-and-ads.md §4. Levers: reviews, Reddit/community answers, inclusion in "best X" listicles, honest comparison pages, clear pricing pages, docs, YouTube.

---

## 3. SaaS pricing in 2026

### 3.1 Models
Kyle Poyar's 2025 State of B2B Monetization (240 companies, Apr–May 2025): flat-fee primary model 29% → 22%; seat-based 21% → 15%; **hybrid 27% → 41%**; outcome-based 5% today, 25% expect it by 2028; 53% include AI in the core offering, 16% sell AI as add-on; **three in four changed pricing in the last year**; cost/margin was the top factor in AI pricing ([Growth Unhinged 2025-06](https://www.growthunhinged.com/p/2025-state-of-b2b-monetization)). Usage-based components: 77% of the largest software companies (Metronome, vendor, 2025-06) ([BusinessWire](https://www.businesswire.com/news/home/20250603500802/en)).

Reference prices for the 2025–2026 repricing wave:
- **Salesforce Agentforce:** $2 per conversation → Flex Credits (2025-05): $500 per 100,000 credits, 20 credits ($0.10) per action; also a $5/user/mo license option ([Salesforce](https://www.salesforce.com/blog/flex-credits/), [pricing](https://www.salesforce.com/agentforce/pricing/)).
- **Intercom Fin:** $0.99 per outcome/resolution, minimum commitment (e.g. 50 outcomes/mo) ([Intercom](https://www.intercom.com/pricing)).
- **GitHub Copilot:** Pro $10/mo with 300 premium requests, $0.04 per extra request; model multipliers ([GitHub Docs](https://docs.github.com/en/copilot/reference/copilot-billing/request-based-billing-legacy/copilot-requests)).
- **Cursor:** 2025-06-16 Pro moved from request limits to compute/usage limits and added a $200 Ultra tier; poor communication led to a public apology and refunds (2025-07-04) ([TechCrunch](https://techcrunch.com/2025/07/07/cursor-apologizes-for-unclear-pricing-changes-that-upset-users/)).
- **monday.com:** 500 AI credits/mo on paid plans; **Clay:** subscription + credits, rollover up to 2x, unlimited seats, only 10% annual discount (Growth Unhinged).

### 3.2 Tiers, value metric, anchoring
- Good-better-best + "Enterprise: contact us" remains standard; 2–4 tiers. Middle-tier share 50–70% is a practitioner target, not a measured benchmark; the decoy/compromise effect is well documented in lab and single cases (Huber, Payne & Puto 1982; Economist subscription example) ([Monetizely](https://www.getmonetizely.com/articles/the-compromise-effect-why-do-consumers-gravitate-toward-the-middle-option)).
- Value metric: choose the unit that grows with customer value and that the customer can predict (contacts, tracked users, resolutions, credits). In AI products, it must also track your marginal cost.
- Companies with ACV < $5k and PLG typically publish prices; higher ACV hides them (Growth Unhinged).

### 3.3 Trials and freemium
| Model | Free→paid (ChartMogul 2026 as summarized by Userpilot) |
|---|---|
| Freemium | 3–5% good, 8–12% great |
| Free trial, no card | 4–6% good, 10–15% great |
| Reverse trial | 4–6% good, 8–12% great |
| Free trial, card required | 25–35% good, 50–60% great (but far fewer signups) |
Median across all 8%; ChartMogul notes the trial/freemium gap disappears once signup volume is considered ([ChartMogul](https://chartmogul.com/reports/saas-conversion-report/), [Userpilot](https://userpilot.com/blog/free-trial-conversion-rate/)). B2C apps: hard paywall vs freemium and trial-length effects in marketing-and-ads.md §3.

### 3.4 Annual discounts
Most common 16.7% (two months free); typical 15–20%; cheaper plans give larger % discounts ([Recurly](https://recurly.com/research/saas-benchmarks-for-subscription-plans)). Multi-year: 10–25% (aggregator, low confidence).

### 3.5 Price increases
- SaaS renewal prices rose ~12.3% YoY (Vertice index, 2025-09; peak 14% in 2025-05); median list increase ~7.8% (Zylo 2026, via secondary) ([Vertice](https://www.vertice.one/insights/saas-inflation-rate)).
- Outcome evidence is anecdotal: $49→$79 (+61%) with grandfathering → 3.2% churn, +47% net revenue; grandfathered churn <3% (practitioner) ([McKelvey](https://justinmckelvey.com/blog/how-to-raise-prices-without-losing-customers)); DesignJoy raised 9 times, grandfathering existing clients ([Sliplane pattern](https://onepage-research.sliplane.app/lessons/pricing/price-p123)). Widely repeated statistics ("62% less churn with grandfathering", "1% price = 11% profit") lack traceable primary sources — not used.
- Practice: test on new customers first; 30–90 days' notice; grandfather 6–12 months; tie increases to added value; offer annual lock-in at old price.

### 3.6 Price testing at low volume
Van Westendorp 200–400 respondents, conjoint 300–600 (practitioner rules of thumb); pitfalls: stated vs revealed WTP, non-buyers in panels, pooled segments, order effects ([Monetizely](https://www.getmonetizely.com/articles/van-westendorp-vs-gabor-granger-for-saas-which-pricing-methodology-to-choose), [DevelopmentCorporate](https://developmentcorporate.com/product-management/how-to-run-a-gabor-granger-or-van-westendorp-pricing-test-for-your-saas/)). A/B tests on price need hundreds of conversions per arm; at seed volume use sequential cohort tests + WTP conversations **[design]**.

### 3.7 Discounting in sales
Vendr: average negotiated discount ~10% and falling since mid-2022 ([SaaStr](https://www.saastr.com/vendr-the-average-saas-discount-is-about-10-and-trending-down)); Vertice: ~34% off list on average (ERP/AI ~45%) ([Vertice](https://www.vertice.one/insights/average-discount-from-list-price)) — different methods (opening offer vs list). By ACV **[design]**: self-serve 0–5%, SMB 5–15%, mid-market 10–25%, enterprise 15–35%.

### 3.8 Localized / PPP pricing
Published uplift numbers (20–70% more international sales, GitHub/Notion cases) come from vendor blogs without controls ([Fungies](https://fungies.io/ppp-pricing-saas-boost-global-revenue-2026), [Monetizely](https://www.getmonetizely.com/articles/should-you-charge-less-in-emerging-markets-geographic-pricing-for-saas-companies)). Merchants of record (Paddle, Lemon Squeezy) and tools like ParityDeals implement it. Game **[design]**: +30–100% conversion in low-PPP countries at 40–70% of US price, 5–15% cannibalization via VPN/misreported location.

---

## 4. Obsolete advice (2016 → 2026)

| 2016 advice | 2026 reality |
|---|---|
| Per-seat pricing is the default | Seat-based primary model down to ~15%; hybrid (platform + usage/credits) ~41% |
| Unlimited usage on flat plans | AI inference makes heavy users unprofitable; credits/fair-use caps; Cursor 2025 shows the backlash risk when changing it badly |
| Outcome-based pricing is a fantasy | Live for AI agents (Intercom $0.99/resolution), but only ~5% primary model |
| "Never raise prices" / set and forget | 75% changed pricing in a year; SaaS renewal prices +8–14%/yr |
| Freemium always wins | Median free→paid ~8%, bimodal; card-required trials ~30%; choose by motion and cost to serve (free AI usage costs real money) |
| AppSumo LTD = cheap launch fuel | Platform revenue down ~50%; LTD users carry AI compute cost forever |
| Get on Product Hunt / TechCrunch and you're made | Journalist response to pitches ~3%; coverage spikes last days |
| App stores = free distribution | Crowded (4 in 5 Shopify apps <10 reviews; review queues ~30 days in 2026); fees changing (Shopify 0% first $1M lifetime; Atlassian up to 17/25%) |
| SEO-only content marketing | AI answers cite third-party sources (84%); reviews, Reddit, comparison pages and listicle mentions matter |
| Build a Chrome extension and ship 10 variants | 2026-08: 2 publication slots per new publisher by default |
| Big-company partnership will make us | Most seed-stage strategic deals stall; sell direct first |
| Affiliate program = passive revenue | Most affiliates never sell; top 10% drive most revenue; fraud on recurring commissions |
| Trade-show booth for awareness | $15k–$50k all-in per show; ~80% of leads never followed up; better to book meetings at events |
| Directory/plugin stores for AI = GPT Store | 2025–2026: ChatGPT apps (MCP-based, no in-chat digital sales at launch), Claude connectors directory, MCP registries |

---

## 5. Simulation parameters

| Parameter | Value / range | B2C / SMB / Ent | Source + date |
|---|---|---|---|
| Affiliate commission | 20–30% recurring for 12 months (SMB up to 40%; Ent 10–25% or $100–$500 bounty) | B2C/SMB; Ent rare | Rewardful 2025-08/2026-06 (vendor); Quality Unit 2025 (vendor) |
| Affiliate tool cost | $29–$149/mo (Tolt/Rewardful/FirstPromoter); PartnerStack ~$800–$5,000/mo | All | CostBench 2026 (third-party) |
| Share of recruited affiliates with ≥1 sale | 5–15%; top 10% of affiliates → 70–90% of affiliate revenue | B2C/SMB | [design]; concentration from Quality Unit / MEAN CEO blogs |
| Affiliate share of MRR (mature program) | 10–25% | B2C/SMB | Rewardful (vendor, survivorship bias) |
| Referral participation | 2–15% of active customers | B2C > SMB > Ent | GrowSurf/SaaSquatch/Cello (vendor) 2025–2026 |
| Referral share of new customers | new program 5–15%; best-in-class 20–30% | All | GrowSurf 2026 (vendor); [design] |
| Shopify App Store fee | 0% up to $1M lifetime, then 15% + 2.9% processing | SMB | Shopify docs 2025 |
| Atlassian Marketplace fee | Forge 17%, Connect 25% (from 2026-10); 0% first $1M Forge lifetime | SMB/Ent | Atlassian 2025–2026 |
| Microsoft Marketplace fee | 3% transactable | Ent | Microsoft FAQ (since 2021) |
| Salesforce AppExchange | ~$999 security review; 15–25% rev share; 4–9 months to first deal | Ent | Salesforce doc (older); [design] timing |
| HubSpot certification gate | 6 months + 60 active installs | SMB | HubSpot changelog 2024 |
| Marketplace review time | Shopify 5–10 bd (2026: ~30 days); Chrome days–weeks; Google days | — | Shopify forum 2026; Chrome docs 2026-08 |
| Marketplace cold start | 0–2 organic installs/week until ~10 reviews; ramp 6–18 months | SMB | Indie Hackers 2026 (anecdote); [design] |
| Install → paid (marketplace) | paid app w/ trial 15–40%; free app/extension 0.5–3% | SMB/B2C | [design] |
| AI assistant directories | free; no in-chat subscription sales (ChatGPT); volumes 0–500 signups/mo, very high variance | All | OpenAI 2025-12; [design] |
| Reseller/VAR margin | 20–40% (renewals lower) | SMB/Ent | Monetizely, Reditus, Partner Economics |
| Partner first deal | 3–9 months after signing; 1 in 3–5 partners ever closes | SMB/Ent | [design] |
| Partner win-rate lift | +~12% | SMB/Ent | Crossbeam (vendor) |
| Strategic partnership | 6–18 months; 60–80% stall | All | [design]; practitioner essays |
| Webinar attendance | 40–60% of registrants | SMB/Ent | Goldcast 2025, ON24 2024–25 (platform) |
| Webinar registrant → paid | 2–8% | SMB/Ent | [design] |
| Trade-show booth | $15k–$50k all-in; CPL $100–$900 | Ent | CEIR via vendors 2025–2026 |
| PR retainer | $3.5k–$15k/mo, 3–6 month minimum | All | Everything PR / Bridgehead 2026 |
| Pitch response rate | 2.5–3.5% (short pitches ~6%) | All | Propel 2024 via EPR |
| Podcast host-read CPM | $18–$40 | All | Libsyn 2024–2026, Acast |
| Newsletter CPM | B2C $10–$30; B2B $50–$150; niche $100–$200+ | All | beehiiv; Dupple 2026 (vendor) |
| Newsletter sponsored CTR | 0.5–4% (smaller lists higher) | All | Dupple 2026 |
| YouTube integration CPM | $30–$60 tech/B2B (up to $100+); dedicated 2–3x | B2C/SMB | CreatorsJet, LaunchPoint 2026 |
| Capterra PPC | $2 min bid; $20+ competitive; CPL $30–$100+ | SMB | Capterra terms; SpotSaaS |
| G2 paid | ~$299/mo starter; buyer intent $40k–$50k/yr | SMB/Ent | CostBench 2026-06 |
| Cold call funnel | 9.9% dials connect; ~370 dials/meeting; conv→meeting 2.3–2.7% | SMB/Ent | Belkins 2025; Cognism 2025–2026 |
| Direct mail | response 2–4% prospects, 5–15% ABM dimensional; $0.58–$50/piece | Ent | ANA/DMA via vendors |
| AppSumo LTD | partner nets ~30–70% of gross; platform revenue −50% (2024–26) | SMB | PPC Land 2026-02; IH founder report |
| AI search citations | 84% third-party; top 5 brands 68%; 74% weekly turnover | All | ThriveStack 2026-08 (vendor) |
| Pricing model mix | hybrid 41%, flat 22%, seat 15%, outcome 5% | B2B | Growth Unhinged 2025-06 |
| Price change frequency | 75% changed pricing in last 12 months | B2B | Growth Unhinged 2025-06 |
| Free → paid | median 8%; card-required trial 25–35%; no-card trial/freemium/reverse 3–15% | B2B | ChartMogul × Poyar 2026-01 |
| Annual discount | 15–20%, mode 16.7% | All | Recurly |
| SaaS price inflation | +8–14%/yr | B2B | Vertice 2025-09; Zylo 2026 |
| Price increase churn (no grandfathering) | extra churn ≈ k × increase%, k 0.05–0.15 SMB monthly, 0.02–0.08 Ent annual, 0.1–0.3 B2C; grandfathering cuts spike 50–80%; bad comms ×2 | All | [design] bounded by McKelvey anecdote, Cursor 2025 |
| Negotiated discount | self-serve 0–5%, SMB 5–15%, MM 10–25%, Ent 15–35% | B2B | Vendr (~10%), Vertice (~34%); [design] by ACV |
| Price test sample | VW 200–400; conjoint 300–600; A/B needs hundreds of conversions per arm | All | Practitioner rules of thumb; [design] |
| PPP pricing | 40–70% of US price in low-PPP markets; conversion +30–100%; 5–15% cannibalization | B2C/SMB | [design]; vendor claims |
| AI credit reference prices | Agentforce $0.10/action; Fin $0.99/resolution; Copilot $0.04/premium request | — | Salesforce 2025, Intercom, GitHub docs |

---

## Sources (accessed 2026-10-14)
- Rewardful affiliate benchmarks (2025-08, upd. 2026-06): https://www.rewardful.com/articles/saas-affiliate-program-benchmarks
- Quality Unit commission rates (2025): https://cdn.qualityunit.com/blog/saas-affiliate-commission-rates ; industry size: https://cdn.qualityunit.com/blog/affiliate-marketing-industry-size-2025
- CostBench affiliate tools (2026): https://costbench.com/compare/firstpromoter-vs-partnerstack/ ; G2 costs (2026-06): https://costbench.com/software/review-management/g2/hidden-costs/
- Affiliate fraud: https://track360.io/blog/saas-affiliate-fraud-detection-2026 ; https://payproglobal.com/answers/what-is-affiliate-fraud/
- Referral: https://growsurf.com/statistics/saas-referral-statistics/ ; https://cello.so/?p=14760 ; https://www.prefinery.com/blog/10-key-referral-program-metrics-to-track-2025/
- Shopify: https://shopify.dev/docs/apps/launch/distribution/revenue-share ; https://shopify.dev/changelog/update-to-shopifys-app-developer-revenue-share ; https://community.shopify.dev/t/shopify-app-review-time/32778 ; https://revenuehunt.com/state-of-the-shopify-app-economy/ ; https://www.indiehackers.com/post/my-shopify-app-sat-at-0-reviews-for-3-weeks-at-119-mo-i-just-made-it-free-heres-the-honest-math-92c5164580
- HubSpot: https://developers.hubspot.com/changelog/active-install-requirement-increase-for-app-certification
- Salesforce AppExchange: https://developer.salesforce.com/docs/atlas.en-us.242.0.packagingGuide.meta/packagingGuide/security_review_fees.htm ; https://magicfuse.co/blog/appexchange-pricing-and-monetisation
- Atlassian (2025–2026): https://www.atlassian.com/blog/developer/extended-timelines-for-marketplace-revenue-share-changes
- Microsoft: https://learn.microsoft.com/en-us/partner-center/marketplace-offers/marketplace-faq-publisher-guide
- Google Workspace: https://developers.google.com/workspace/add-ons/concepts/gmail-addon-review
- Zapier: https://docs.zapier.com/platform/publish/partner-program ; https://zapier.com/resources/partner-marketing
- Chrome Web Store: https://developer.chrome.com/docs/webstore/review-process ; https://developer.chrome.com/blog/cws-review-updates-2026 (2026-08-20)
- OpenAI apps (2025-12-17): https://openai.com/index/developers-can-now-submit-apps-to-chatgpt/ ; https://the-decoder.com/openai-launches-app-submissions-and-rolls-out-store-in-the-new-year/
- Anthropic connectors directory: https://claude.com/docs/connectors/directory ; https://support.claude.com/en/articles/11596036-anthropic-mcp-directory-faq
- Partners: https://www.getmonetizely.com/articles/partner-discounts-amp-margins-how-to-structure-a-win-win-saas-reseller-program ; https://getreditus.com/resources/glossary/value-added-reseller ; https://msdynamicsworld.com/node/32239 ; https://insider.crossbeam.com/entry/new-data-involving-partners-in-deals-increases-win-rate-for-nearly-every-ecosystem-size-and-type ; https://insider.crossbeam.com/entry/4-ways-partner-sourced-leads-outperform-cold-leads
- Strategic BD: https://marvinliao.medium.com/business-development-bd-partnerships-make-no-sense-for-most-seed-stage-startups-19794b724058 ; https://kdtvc.substack.com/p/how-platforms-can-think-intelligently-about-early-deal-structure-bfa2dd92f4c7 ; https://review.firstround.com/podcast/partnerships-lessons-from-stripe-notion-cristina-cordova-on-creating-win-win-deals/
- Webinars: https://www.goldcast.io/blog-post/2025-webinar-statistics-b2b-marketers-should-know ; https://www.marketingprofs.com/charts/2025/52917/b2b-webinar-benchmarks-conversion-attendance-personalization
- Events: https://www.attnagency.com/blog/trade-show-booth-design-lead-capture-optimization ; https://www.cometly.com/post/trade-show-roi-measurement
- PR: https://everything-pr.com/how-much-does-a-pr-agency-cost-in-2026 ; https://www.bridgeheadcommunications.com/insights-txt/2026/08/17/b2b-tech-pr-agency-costs-2026 ; https://everything-pr.com/epr-research-and-5w-release-the-pr-pitch-response-rate-study-2026 ; https://umarcomm.umn.edu/blog/2025/12/15/muck-racks-state-pr-2025
- Podcasts: https://www.podderapp.com/post/podcast-advertising-cpm ; https://adopter.media/podcast-advertising-rates
- Newsletters: https://www.beehiiv.com/blog/newsletter-sponsorship-cost ; https://dupple.com/blog/advertising-in-newsletters
- YouTube: https://www.creatorsjet.com/blog/how-much-do-brands-pay-for-youtube-sponsorships ; https://www.launchpointhq.com/guides/rates/how-much-do-tech-youtubers-charge
- Free tools: https://microconf.com/latest/engineering-as-marketing
- Capterra: https://capterra.com/legal/ppc-service-description/ ; https://spotsaas.com/blog/capterra-advertising
- Cold calling: https://www.cognism.com/cold-calling-report-2025 ; https://vida.io/blog/cold-call-success-rate
- Direct mail: https://firstsales.io/blog/b2b-direct-mail-outbound ; https://directmail.io/blog/12-direct-mail-benchmarks-every-marketer
- AppSumo: https://ppc.land/appsumos-revenue-crashes-50-as-lifetime-deal-model-faces-existential-crisis/ (2026-02-07) ; https://www.indiehackers.com/post/my-saas-made-400-000-in-its-first-year-heres-how-1649d7bcc7 ; https://mysignature.io/blog/appsumo-launch/
- AI search: https://www.thrivestack.ai/research/ai-visibility-benchmarks-2026 ; https://everything-pr.com/g2-owns-saas-buying-ai
- Pricing: https://www.growthunhinged.com/p/2025-state-of-b2b-monetization (2025-06) ; https://www.businesswire.com/news/home/20250603500802/en ; https://research.contrary.com/report/metronome ; https://chartmogul.com/reports/saas-conversion-report/ ; https://userpilot.com/blog/free-trial-conversion-rate/ ; https://recurly.com/research/saas-benchmarks-for-subscription-plans ; https://www.vertice.one/insights/saas-inflation-rate ; https://www.vertice.one/insights/average-discount-from-list-price ; https://www.saastr.com/vendr-the-average-saas-discount-is-about-10-and-trending-down ; https://www.salesforce.com/blog/flex-credits/ ; https://www.salesforce.com/agentforce/pricing/ ; https://www.intercom.com/pricing ; https://docs.github.com/en/copilot/reference/copilot-billing/request-based-billing-legacy/copilot-requests ; https://techcrunch.com/2025/07/07/cursor-apologizes-for-unclear-pricing-changes-that-upset-users/ ; https://justinmckelvey.com/blog/how-to-raise-prices-without-losing-customers ; https://onepage-research.sliplane.app/lessons/pricing/price-p123 ; https://www.getmonetizely.com/articles/van-westendorp-vs-gabor-granger-for-saas-which-pricing-methodology-to-choose ; https://developmentcorporate.com/product-management/how-to-run-a-gabor-granger-or-van-westendorp-pricing-test-for-your-saas/ ; https://www.getmonetizely.com/articles/the-compromise-effect-why-do-consumers-gravitate-toward-the-middle-option ; https://fungies.io/ppp-pricing-saas-boost-global-revenue-2026
