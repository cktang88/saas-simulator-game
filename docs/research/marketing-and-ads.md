# Marketing and growth research: paid ads, B2C subscription economics, organic growth (2026)

Research date: 2026-10-14. Scope: what a solo founder (bootstrapped or VC-backed) actually does in 2026 to acquire users for a SaaS or subscription app, and the numbers the simulator should use.

**How to read the numbers.** Almost all ad benchmarks are published by vendors (ad tools, agencies, attribution platforms) from their own customer panels. They disagree, often by 2x. Where they disagree we give a range and say so. Values marked **[design]** are game-design assumptions that are *bounded by* the cited sources but not stated by them; do not present them to players as real statistics. Values marked **[unverified]** appear only in secondary blogs.

---

## 1. Paid ads mechanics

### 1.1 Meta (Facebook/Instagram) in 2026

**Structure.** Campaign (objective + optionally budget, "Advantage+ campaign budget", formerly CBO) → ad set (optimization event, audience, placements, budget if ABO) → ads (creatives). Since 2024–2025 Meta has merged the old Advantage+ Shopping/App campaigns into a unified "Advantage+" sales/app/leads flow; manual campaigns increasingly inherit Advantage+ settings (audience segments, ad scheduling) ([Jon Loomer, 2024-06, updated 2025-03](https://www.jonloomer.com/updates-to-meta-sales-campaigns/)).

**What works in 2026 (consensus of practitioners, not Meta-published rules):**
- **Consolidate.** 1–3 ad sets per campaign, broad targeting (country + age floor, no interests). Fragmentation starves each ad set of conversion signal ([Segwise](https://segwise.ai/blog/how-to-manage-meta-ads-guide), [blckalpaca, 2026](https://blckalpaca.at/en/knowledge-base/social-media/paid-social-performance-marketing/meta-andromeda-gem-advantage-plus)).
- **Creative is targeting.** Meta's Andromeda retrieval system (rolled out 2024–2025) picks *who* sees an ad mostly from the creative itself. Creative diversity (different hooks, formats, angles, personas) replaces audience segmentation ([Chatterbuzz](https://www.chatterbuzzmedia.com/blog/meta-andromeda-creative-targeting/), [Pipeboard](https://pipeboard.co/guides/creative-volume-andromeda)).
- **Signal first.** Pixel + Conversions API (server-side) with deduplication and good Event Match Quality (practitioners cite ≥7/10 [unverified]) before scaling ([easyinsights](https://easyinsights.ai/blog/?p=11545)). For apps: SDK/MMP + SKAdNetwork/AdAttributionKit on iOS; many subscription apps now run **web-to-app funnels** (ad → web quiz/paywall → Stripe → app download) to get full-fidelity web signal and avoid store fees.
- **Optimize for the deepest event you can get ~50/week of.** Trial start if purchases are too sparse; purchase/subscribe once volume allows. RocketShip HQ recommends optimizing for paid conversions rather than trial starts for health & fitness apps when volume permits ([RocketShip HQ](https://www.rocketshiphq.com/meta-optimize-trial-starts-vs-paid-conversions-ios/)).

**Learning phase.** Meta's long-standing guidance: ~**50 optimization events per ad set in 7 days** to exit learning; below that, "Learning limited" and higher, noisier CPA ([Meta developer docs via search, 2025](https://developers.meta.com/horizon/resources/launch-ad-campaign/)). Since 2024 some advertisers report a lighter threshold (**10 conversions in 3 days**), not officially confirmed ([Jon Loomer](https://www.jonloomer.com/updates-to-meta-sales-campaigns/)). Claims that Meta cut Advantage+ to 25/week in April 2026 are **[unverified]** ([1ClickReport](https://www.1clickreport.com/blog/advantage-plus-shopping-25-conversions-2026-guide)). Significant edits (large budget changes, new creatives in some setups, targeting/optimization changes) re-enter learning; practitioners use **~20–30% budget change per step** as the safe ceiling ([Stackmatix](https://www.stackmatix.com/blog/ad-learning-phase-small-budgets), [Jetfuel 2026](https://jetfuel.agency/what-is-the-meta-ads-learning-phase-how-to-exit-it-faster-in-2026/)).

Implication for a solo founder: minimum useful daily budget per ad set ≈ (50 / 7) × target CPA ≈ **7 × CPA per day**. At a $25 cost per trial that is ~$180/day; at a $80 cost per paid sub, ~$570/day. Founders with $30–$50/day must optimize for a shallower event (trial start, registration) and accept "learning limited".

**Attribution (changed in 2025–2026).**
- Default: 7-day click + 1-day view.
- **7-day view and 28-day view windows were removed on 2026-01-12** (announced Oct 2025) ([PPC Land](https://ppc.land/meta-restricts-attribution-windows-and-data-retention-in-ads-insights-api/)). Vendors estimate 15–40% lower reported conversions for accounts that relied on them [unverified vendor estimate] ([Dataslayer](https://www.dataslayer.ai/blog/meta-ads-attribution-window-removed-january-2026)).
- **March 2026:** click-through attribution counts only *link clicks*; likes/shares/saves move to a new **engage-through** window; the video engaged-view threshold drops from 10s to 5s ([PPC Land, 2026-03](https://ppc.land/meta-rewrites-click-attribution-rules-finally-aligning-with-google-analytics/)).
- iOS app campaigns: SKAdNetwork/AEM give delayed, aggregated, partially modeled data. Game effect: reported conversions are a noisy, delayed fraction of true conversions; the founder should reconcile against Stripe/RevenueCat (blended CAC / MER).

**Frequency and creative fatigue.** No Meta-published threshold. Practitioners watch **7-day frequency ~2.5–3.0 on cold prospecting** (retargeting tolerates 5–7). The usual fatigue signal is CTR falling 20–30% from the ad's own baseline over 3–7 days, followed by rising CPM/CPA ([Segwise](https://segwise.ai/blog/how-to-measure-creative-fatigue), [Billo](https://billo.app/blog/creative-fatigue/)). Ads commonly "die" after 2–3 weeks at meaningful spend ([Billo](https://billo.app/blog/creative-fatigue/)).

**Creative volume and hit rate.** Motion's Creative Benchmarks 2026 (578,750 creatives, 6,015 accounts, $1.29B spend, updated 2026-04-17): **~5% of creatives become winners** (≥10× account median spend and ≥$500); 3.8% for accounts under $10k/month up to 8.2% for $1M+/month accounts; ~6% of ads capture the majority of spend; about half of ads get little or no spend ([Motion](https://motionapp.com/library/research/creative-benchmarks-2026/winners-are-rare)). Opascope (200+ accounts) finds a 5–7% hit rate with a CPA-based definition ([Opascope](https://opascope.com/insights/facebook-ads-creative-testing/)). Recommended volume: ~5–15 genuinely different new creatives per week for accounts spending ≥$5k/month; "20/week" claims are unverified ([Pipeboard](https://pipeboard.co/guides/creative-volume-andromeda), [dataiads](https://www.dataiads.io/en/blog/meta-andromeda-creative-velocity)). At 5%, testing 4 ads/week yields ~1 winner/month.

**Video creative metrics.** Hook rate (thumbstop) = 3-second views / impressions; most sources put 25–30% as solid and 35–45% as top-decile; one review reports a 24% average ([AdManage](https://admanage.ai/blog/what-is-a-good-hook-rate-for-facebook-ads), [Billo](https://billo.app/blog/hook-rate-to-hold-rate)). Hold rate (e.g. 15-second views or ThruPlays / 3-second views) ~25%+ is considered good; definitions vary. TikTok uses a 2-second view, not comparable.

### 1.2 Meta cost benchmarks
| Metric | Value | Source |
|---|---|---|
| CPM, all advertisers (global, Oct 2024–Sep 2025) | avg ~$19.80; Nov 2024 high $24.67; Jan 2025 low $17.97 | [Superads](https://www.superads.ai/facebook-ads-costs/cpm-cost-per-mille/marketing-advertising) |
| CPM, SaaS & Cloud Platforms (Jul 2025–Jul 2026) | avg ~$27; peak $40.96 (Feb 2026), low $19.34 (Jun 2026); ~32% above global baseline | [Superads](https://www.superads.ai/facebook-ads-costs/cpm-cost-per-mille/saas-cloud-platforms) |
| CPM, ecommerce panels | $6–$14 depending on tracker; Triple Whale reports CPM +~20% in 2025 and CTR 2.19% | [Triple Whale](https://triplewhale.com/blog/facebook-ads-benchmarks), [Affect Group](https://affectgroup.com/blog/meta-ads-cpm-in-the-us-2025-benchmarks-for-facebook-and-instagram/) |
| Seasonality | Oct→Nov +21%, Nov→Dec −16%, Dec→Jan −13% (global); Q4 25–60% above annual average (other sources) | [Superads](https://www.superads.ai/facebook-ads-costs/cpm-cost-per-mille/marketing-advertising), [admakeai](https://admakeai.com/blog/cost-per-impression-cpm-explained) |
| iOS CPI, subscription Health & Fitness (Meta) | median $7.80, IQR $5–$12 | [RocketShip HQ](https://www.rocketshiphq.com/?p=5516) |

Note: B2B/SaaS CPMs do not follow the consumer BFCM peak as strongly; Superads' SaaS segment peaked in February 2026.

### 1.3 Google Ads
- **Search** is intent capture: works when people already search for the problem/category/competitor. Non-branded B2B SaaS CPC ~$5.34 (+29% YoY) per Involve Digital; other agencies quote $2.50–$6, competitive terms $20+ ([Involve Digital](https://www.involvedigital.com/insights/google-ads-b2b-saas), [Callin](https://callin.io/b2b-saas-marketing-benchmarks/)).
- All-industry search (WordStream/LocaliQ): 2025 edition CTR 6.66%, CPC $5.26, CVR 7.52%, CPL $70.11; 2026 edition (Apr 2025–Mar 2026, ~13.5k US campaigns) CTR 6.64%, CPC $5.42, CVR 8.18% ([WordStream](https://www.wordstream.com/resources/google-ads-industry-benchmarks), [secondary summary](https://christopholivierconsulting.com/?p=5961)).
- B2B SaaS lead/trial costs: CPL ~$100–$250 (avg ~$150) ([Saas Hero](https://www.saashero.net/google-ppc/b2b-lead-gen-cost-2025/)); cost per trial $50–$200 self-serve, $200–$800 sales-assisted, $500–$2,000 enterprise demo ([Redefine Web](https://redefineweb.com/blog/saas-ppc-case-studies/)).
- **Smart Bidding** (tCPA/tROAS/Max Conversions) needs data: practitioners use ≥15–30 conversions/30 days per campaign, 50+ ideal ([GrowthSpree](https://www.growthspreeofficial.com/blogs/b2b-saas-google-ads-bid-strategy-conversion-benchmarks-2026-manual-cpc-vs-target-cpa-vs-troas-vs-max-conversions)). Google: let tCPA run at least one conversion cycle; learning period 1–2 weeks after significant changes; run new **Performance Max** at least **6 weeks** before judging ([Google Ads Help](https://support.google.com/google-ads/answer/11385582)).
- **PMax** (all Google inventory, AI-driven) and **Demand Gen** (YouTube/Discover/Gmail, social-style creative) need conversion volume and assets; for low-volume B2B they tend to spend on low-intent inventory unless fed offline/CRM conversions. Value-based bidding on imported CRM conversions is the 2026 B2B best practice ([Involve Digital](https://www.involvedigital.com/insights/google-ads-b2b-saas)).

### 1.4 TikTok
Triple Whale-derived 2025 panel: CPM $13.26 (+16% YoY), CTR 1.77%, link CTR 0.49–0.73%, CVR 2.01%, CPA $32.74, ROAS 2.21 ([Influee](https://influee.co/blog/tiktok-ads-benchmarks)); another aggregator: median CPM ~$8, CPC ~$0.80 ([TT Calculator](https://ttcalculator.net/learn/tiktok-advertising-rates-benchmarks/)). Spark Ads run ads from a creator's organic post via an authorization code. Creative burns out faster than on Meta; native, lo-fi, creator-led video outperforms polished ads.

### 1.5 Apple Search Ads (Apple Ads)
SplitMetrics 2026 report (2025 data): tap-through rate 9.7%, tap→install conversion 66.2%, average CPT ~$2.25 across top 15 categories; Finance $6.06, Sports $14.41 ([SplitMetrics](https://splitmetrics.com/apple-ads-search-results-benchmarks-2026/executive-summary)). 2024 data: CR 67.2%, CPT ~$2.50, CPA ~$2.90 ([SplitMetrics 2025](https://splitmetrics.com/apple-ads-search-results-benchmarks-2025/)). High-intent, limited scale; brand defense + category keywords; usually the first paid channel for a subscription app.

### 1.6 LinkedIn (B2B)
Metadata (153 B2B advertisers, $57.6M spend, 2025): median CPL $202, CTR 0.67%, CPC $9.39, CPM $63.19 ([Metadata](https://metadata.io/b2b-advertising-benchmarks)). Others: CPC $5–$15, CPM $33–$90, CPL $75–$250 ([Sales-Mind](https://sales-mind.ai/blog/2025-sales-funnel-benchmarks-linkedin), [Nav43](https://nav43.com/blog/2025-linkedin-ads-benchmarks-every-saas-tech-marketer-needs)). Usually uneconomic for ACV under ~$5k.

### 1.7 Landing pages
Unbounce Conversion Benchmark Report 2024 (41k pages, 57M conversions): all-industry median **6.6%**, SaaS median **3.8%** ([Unbounce](https://unbounce.com/conversion-benchmark-report/saas-conversion-rate/)). Paid-traffic SaaS landing pages median ~2.4% (cited to WordStream) ([Callin](https://callin.io/b2b-saas-marketing-benchmarks/)). Blog visitor→trial 0.5–2% ([Callin](https://callin.io/b2b-saas-marketing-benchmarks/)).

### 1.8 Scaling
- Vertical scaling (raising budget) beyond ~20–30%/day typically re-enters learning and raises CPA; horizontal scaling (new creatives/angles/geos, duplicate winners into the scaling campaign) is preferred. No public dataset quantifies the CPA penalty; the simulator curve below is **[design]**.
- Diminishing returns: CPA rises with spend because the algorithm reaches progressively less responsive users. Model CPA ∝ spend^0.15–0.35 **[design]**.

---

## 2. UGC creators and AI creative

- **Human UGC price (2026):** single video ~$150–$212 average, median ~$175; band $150–$300; higher for TikTok/Reels, hook variations, raw footage, and usage rights ([Influee UGC Rates 2026](https://influee.co/blog/ugc-price)). Mid-tier creators $150–$500 ([Segwise](https://segwise.ai/blog/ai-ugc-vs-human-ugc-meta-ads-roas-2026)).
- **Whitelisting / Spark Ads / partnership ads fee:** typically **20–30% of the base content fee per 30-day window**; TikTok authorization codes run 7–60 (some sources 365) days ([Influencer Marketing Hub](https://influencermarketinghub.com/whitelisting-and-spark-ads/), [Elev8or](https://www.elev8or.io/blog/influencer-whitelisting-guide-for-brands)).
- **AI UGC / avatars (Arcads, HeyGen, Creatify and similar):** $5–$30 per video; vendor aggregate puts AI UGC CTR at 85–110% of human baseline ([Segwise](https://segwise.ai/blog/ai-ugc-vs-human-ugc-meta-ads-roas-2026)). RevenueCat's own test: a HeyGen "digital twin" of a PM reached 87% of the human conversion rate at 31% lower CPA, but a 0.2s lip-sync glitch cost 68% of CTR in another variant ([RevenueCat](https://www.revenuecat.com/blog/growth/ad-generated-ads-ugc)). Humans keep an edge for higher-priced/trust-heavy products (+31% post-click CVR for products over $75 in one agency's data) ([Moburst](https://intercept.moburst.com/ai-avatar-ads-vs-real-creators-which-wins-on-meta/)). 2026 practice: use AI to test angles/hooks cheaply, then re-shoot winners with real creators or the founder.
- **Founder-led content** (founder on camera) is free, authentic and often a top performer for B2B and indie apps.

---

## 3. B2C subscription app economics

Primary source: RevenueCat State of Subscription Apps 2026 (published 2026-03-19, Part 2 2026-05-28; 115,000+ apps, $16B+ revenue) ([RevenueCat SOSA 2026](https://www.revenuecat.com/state-of-subscription-apps), [summary](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026)). Secondary: Adapty State of In-App Subscriptions 2025 (2025-07-16; 11,000+ apps, $1.9B) ([Adapty](https://adapty.io/blog/state-of-in-app-subscriptions-2025-in-10-minutes/)).

**Funnel**
- Download→trial (D30 median): North America 7.1%, W. Europe 5.0%; by category Business 9.1%, Health & Fitness 6.9%, Gaming 4.4%. 78–90% of trial starts happen on Day 0; after Day 3 <5%.
- Trial→paid by trial length (median): **≤4 days 25.5%, 5–9 days 37.4%, 17–32 days 42.5%**. Yet 46.5% of apps now use ≤4-day trials (cash-flow, faster data). North America 34.2%, IN/SEA 15.2%.
- Day-0 share of trial cancellations: 3-day 55.4%, 7-day 39.8%, 14-day 35.7%, 30-day 31.1%.
- Download→paid at D35: overall median **2.0%**; hard paywall 10.7% (top quartile 20%), freemium 2.1%.
- Half of conversions (50.6%) happen on Day 0; 19.2% after week 6.

**Pricing & mix:** most common prices weekly $5, monthly $10, yearly $30 (median ~$32–35). Plan mix by subscriptions sold: monthly 42%, yearly 34% (yearly share falling from 41% to 34%). Adapty: weekly plans ~half of subscriptions in its panel; US averages weekly $8.1, monthly $15.2, annual $44.6.

**Retention / churn**
- First renewal (median, by category; RevenueCat 2026): monthly 42–61% (Business 61, Health & Fitness 57, Productivity 54, Photo & Video 48); annual 23–40% (Business 40, Productivity 23); weekly 35–58% ([RevenueCat](https://www.revenuecat.com/blog/growth/average-subscription-renewal-rates-by-app-category)).
- Monthly plans: 43% retained at day 90, **17% after one year**; weekly: 65% cancel within 30 days, **5% after one year** (Adapty 2025).
- Annual: 35% of annual cancellations happen in Month 1 (auto-renew turned off), ~3–10%/month mid-year, spike 9–14% in Month 12; first-year annual retention fell 31%→28%; ~72% of annual subscribers cancel within year 1 (2026). Reactivation: annual 5%, monthly ~20% within a year.
- Billing failures cause 31% of Google Play and 14% of App Store cancellations.
- AI apps: 41% higher year-1 realized LTV ($30.16 vs $21.37) but 36% worse 12-month monthly-plan retention.

**Refunds:** Adapty: US iOS median refund rate 2.71%; annual plans highest (4.2% in 2025 report; 6–7.6% in its refund benchmark), weekly 2.6%; US/LATAM >3%, Europe ~2.3% ([Adapty refunds](https://adapty.io/blog/refund-rate-metrics-and-benchmarking/)). RevenueCat publishes no refund benchmark.

**Revenue / LTV**
- Revenue per install (median): D14 $0.23, D60 $0.34; hard paywall D14 $2.32, D60 $3.09; North America D14 $0.38, D60 $0.55.
- Year-1 realized LTV per payer: monthly ~$17 NA (Health & Fitness $24, Business $19); yearly ~$26 NA (Business/H&F ~$35). RevenueCat 2025 report: median first-year LTV $27.21, hard paywall $49.30 (as cited by [Segwise](https://segwise.ai/blog/roas-benchmarks-industry-standards.md)).
- ROAS curve targets used by app marketers: D7 15–30%, D30 40–70%, D90 70–110% ([Segwise 2026](https://segwise.ai/blog/roas-benchmarks-industry-standards.md)) [vendor].
- **Median app revenue 1 year after launch: ~$72/month**; top quartile $429; top 10% $2,574. Only 17.3% of new apps reach $1k/month within 2 years, 4.6% reach $10k. 14,000+ new subscription apps launch per month (7x since 2022). MRR growth median 5.3% YoY; top quartile +80%, bottom quartile −33%.

**Store fees and payments (2026)**
- Apple: 30% standard; **15%** for Small Business Program (<$1M/yr proceeds) and for subscriptions after a subscriber's first year. Google Play: 15% on subscriptions (and first $1M).
- **US anti-steering:** On 2025-04-30 Judge Gonzalez Rogers found Apple in contempt; Apple had to allow external purchase links/buttons in US apps with no commission. On 2025-12-11 the Ninth Circuit upheld contempt but said Apple may eventually charge a cost-based commission to be set by the district court; **until then, zero commission on US linked-out purchases** remains in effect. Apple may require IAP to be offered as prominently as the external link ([Fenwick](https://www.fenwick.com/insights/publications/ninth-circuit-largely-upholds-ruling-in-epic-v-apple), [Appcharge](https://appcharge.com/blog/apple-commission-ban-partially-overturned-but-nothing-changes-for-developers-yet)). Apple continued pursuing appeals in 2026 ([MacRumors, 2026-06](https://macrumors.com/2026/06/11/apple-fights-back-against-epic/)).
- Web payments: Stripe ~2.9% + $0.30 (US cards) or a merchant of record (Paddle/Lemon Squeezy-type) ~5% + $0.50 which also handles sales tax/VAT. Web is still only 3.2% of subscription-app revenue globally (4.9% NA), but 41% of top-tier apps use it.

---

## 4. Organic growth and word of mouth

- **Friends / personal network.** No systematic data exists. Founder reports consistently show friends produce first *users* and feedback, rarely paying customers unless they are in the ICP ([Indie Hackers threads](https://www.indiehackers.com/post/how-did-you-get-your-first-paying-customer-1ccf1f0ea7)). One founder: 43 emails → 17 replies → 1 paid. Product Hunt case: ~400 signups → 1 paying customer ([Indie Hackers](https://www.indiehackers.com/post/400-signups-from-product-hunt-1-paying-customer-what-4-days-taught-me-about-launch-vs-traction-7c0aacf745)). Game values below are **[design]**.
- **K-factor.** Typical SaaS 0.15–0.25; good referral programs 0.5–0.7; ≥1 is rare and usually temporary ([Saxifrage](https://www.saxifrage.xyz/post/k-factor-benchmarks), [LaunchList](https://getlaunchlist.com/glossary/viral-coefficient)). Treat sustained K>1 as a near-impossible event. A K of 0.2 still means a 25% boost on top of paid/organic acquisition (1/(1−K)).
- **Product Hunt 2025–2026.** Still worth one day for backlinks, feedback and a short spike; not a growth channel. ~60% of launch traffic arrives in the first 24 hours; finishing top 3 has <5% base rate; ranking weights engagement over raw upvotes [vendor claims] ([LaunchList guide](https://app.getlaunchlist.com/blog/how-to-launch-on-product-hunt-2026), [MySignature](https://mysignature.io/blogproduct-hunt-launch/)).
- **Build in public on X/LinkedIn.** Works as a compounding audience asset for indie founders selling to other builders/marketers; weak for most consumer niches. LinkedIn organic reach fell sharply in 2025 (van der Blom 2025: views −~47%, engagement −~39%), and posts with external links get less reach (estimates 19–50%); personal profiles beat company pages ([Ordinal](https://www.tryordinal.com/blog/linkedin-link-penalty-study), [SocialPilot](https://www.socialpilot.co/de/blog/linkedin-algorithm)). Put links in comments or not at all.
- **SEO in the AI-answer era.** AI Overviews cut position-1 CTR ~58% (Ahrefs, Dec 2025) and organic CTR on informational queries 61% (Seer, Nov 2025; 1.76%→0.61%) ([Ahrefs](https://ahrefs.com/blog/ai-overviews-reduce-clicks-update/), [PPC Land on Seer](https://ppc.land/google-ai-overviews-reduce-organic-ctr-61-paid-traffic-68/)). Only ~1.7% of new pages reach the top 10 within a year; 72.9% of top-10 pages are 3+ years old; average #1 page ~5 years old ([Ahrefs](https://ahrefs.com/blog/how-long-does-it-take-to-rank/)). Low-competition long-tail: 3–6 months; competitive: 12–24 months [agency].
- **GEO/AEO (LLM search).** AI chatbots send a small share of traffic (Ahrefs: 0.28% of web traffic, March 2026; Conductor ~1%) but it converts well (Ahrefs' own site: 0.5% of visitors → 12.1% of signups; ecommerce studies 1.3x organic) ([Ahrefs](https://ahrefs.com/blog?p=196969), [AirOps](https://airops.com/blog/ai-referral-traffic-conversion-rates)). Levers: be mentioned on third-party pages LLMs cite (Reddit threads, comparison/"best X" listicles, G2/review sites, YouTube), clear comparison and pricing pages, structured docs.
- **Reddit/communities.** Value-first participation in niche subreddits/Discords/Slacks; self-promotion rules are strict. Reddit threads are heavily cited by Google and LLMs, so helpful answers have long tails.
- **B2B solo founder channels.** Founder-led LinkedIn content, niche newsletters (own + sponsorships), communities, integrations/marketplaces (Shopify, Slack, HubSpot, Chrome Web Store, Zapier, GPT/Claude/MCP directories), cold outbound under Gmail/Yahoo 2024 bulk-sender rules (SPF/DKIM/DMARC, one-click unsubscribe, spam rate under 0.3%) ([Google](https://support.google.com/a/answer/81126)).
- **Referral programs.** Two-sided rewards tied to the product's value (credits, extra usage, free month) beat cash; must trigger at a moment of delight. Expect them to add to K by 0.05–0.3 **[design]**, not to create virality.

---

## 5. Obsolete advice (2016 → 2026)

| 2016 advice | 2026 reality |
|---|---|
| Hyper-segment Facebook audiences with interest stacks and 1% lookalikes; dozens of ad sets | Broad targeting, 1–3 ad sets, Advantage+; creative diversity does the targeting (Andromeda) |
| Judge ads on 28-day click / 28-day view | 7-day/28-day view removed Jan 2026; 7-day click + 1-day view; measure blended CAC/MER and cohort revenue |
| Pixel is enough | Pixel + Conversions API; SKAN/AdAttributionKit on iOS; web-to-app funnels |
| One great ad runs for months | ~5% of creatives win; fatigue in 2–3 weeks; test 5–15 new concepts/week at scale |
| Hire an agency for polished video | Lo-fi UGC, founder-on-camera, AI UGC for hook testing at $5–$30/video |
| Freemium is the default for consumer apps | Hard paywall converts 10.7% vs 2.1% download→paid; RPI 8x higher at D60 |
| Every app pays Apple 30% | 15% small business/year-2 subs; US external links commission-free (pending remand); web checkout via Stripe |
| Blog 3x/week for SEO traffic; rank in 3 months | AI Overviews cut CTR ~50–60%; new pages rarely rank in year 1; optimize for citations in LLM answers + bottom-funnel pages |
| Launch on Product Hunt/Hacker News = growth | One-day spike, low paid conversion; still useful for backlinks/feedback |
| Growth hacks: viral loops, invite walls, K>1 | Typical K 0.15–0.25; virality is rare; retention and payback drive growth |
| Post links to LinkedIn/Twitter to drive traffic | Platforms suppress external links; native content, links in comments |
| Spray cold email at scale | 2024 Gmail/Yahoo bulk-sender rules; small, researched, AI-personalized sequences |
| 7-day trial standard; long trials kill cash | Longer trials convert better (42.5% vs 25.5%) but delay cash; choose deliberately |
| "Build it and they will come" | 14,000+ new subscription apps/month; median app ~$72/month after a year — distribution is the moat |

---

## 6. Simulation parameters

| Parameter | Game value / range | B2C vs B2B | Source + date |
|---|---|---|---|
| Meta CPM base (US) | B2C consumer $12–$20; SaaS/B2B targeting $20–$35 | Both | [Superads global & SaaS, 2025–2026](https://www.superads.ai/facebook-ads-costs/cpm-cost-per-mille/saas-cloud-platforms); [Affect Group 2025](https://affectgroup.com/blog/meta-ads-cpm-in-the-us-2025-benchmarks-for-facebook-and-instagram/) |
| Meta CPM monthly multiplier (B2C) | Jan 0.90, Feb 0.95, Mar 0.97, Apr 0.98, May 1.00, Jun 0.98, Jul 0.97, Aug 0.98, Sep 1.00, Oct 1.03, Nov 1.25 (BFCM week 1.5–2.0), Dec 1.04 | B2C | Anchors Oct/Nov/Dec/Jan from [Superads Oct 2024–Sep 2025](https://www.superads.ai/facebook-ads-costs/cpm-cost-per-mille/marketing-advertising); other months and BFCM spike [design], bounded by "Q4 +25–60%" ([admakeai 2026](https://admakeai.com/blog/cost-per-impression-cpm-explained)) |
| Meta CPM monthly multiplier (B2B) | Flatter: Q4 1.1–1.25, Feb can peak 1.3–1.5, Jun–Jul 0.75–0.85 | B2B | [Superads SaaS Jul 2025–Jul 2026](https://www.superads.ai/facebook-ads-costs/cpm-cost-per-mille/saas-cloud-platforms) (noisy, one vendor) |
| TikTok CPM / CTR | $8–$13 CPM; CTR 1.77% all, link CTR 0.5–0.7% | B2C | [Influee 2026 (2025 data)](https://influee.co/blog/tiktok-ads-benchmarks); [TT Calculator 2026](https://ttcalculator.net/learn/tiktok-advertising-rates-benchmarks/) |
| LinkedIn CPM / CPC / CPL | $35–$90 / $5–$15 / $75–$250 (median $202) | B2B | [Metadata 2025](https://metadata.io/b2b-advertising-benchmarks) |
| Google Search CPC / CVR | All-industry $5.26–$5.42, CVR 7.5–8.2%; B2B SaaS non-brand $2.5–$6 (spikes $20+) | Both | [WordStream 2025/2026](https://www.wordstream.com/resources/google-ads-industry-benchmarks); [Involve Digital 2025](https://www.involvedigital.com/insights/google-ads-b2b-saas) |
| Apple Search Ads | CPT $1.8–$2.5 (Finance ~$6), TTR ~10%, tap→install 66% | B2C app | [SplitMetrics 2026](https://splitmetrics.com/apple-ads-search-results-benchmarks-2026/executive-summary) |
| Meta link CTR by creative quality | poor 0.4–0.7%, average 0.8–1.2%, good 1.3–2.0%, winner 2.0–3.5% | Both (B2B ×0.7) | [design], anchored to 2025 all-click CTR 2.19–2.46% ([Triple Whale](https://triplewhale.com/blog/facebook-ads-benchmarks)) and link CTR 0.5–0.7% on TikTok |
| Hook rate (3s views/impr.) | weak <20%, average ~24–30%, top 35–45% | Both | [AdManage](https://admanage.ai/blog/what-is-a-good-hook-rate-for-facebook-ads), [Billo](https://billo.app/blog/hook-rate-to-hold-rate) 2025–2026 |
| Creative hit rate (becomes a winner) | 4–8% (3.8% <$10k/mo accounts → 8.2% enterprise); skill can raise to ~10% | Both | [Motion Creative Benchmarks 2026-04](https://motionapp.com/library/research/creative-benchmarks-2026/winners-are-rare); [Opascope](https://opascope.com/insights/facebook-ads-creative-testing/) |
| Creative lifespan before fatigue | 14–28 days at meaningful spend; winners 4–8 weeks | Both | [Billo 2025](https://billo.app/blog/creative-fatigue/); Motion 28-day cutoff |
| Frequency fatigue curve (7-day freq → CTR multiplier, prospecting) | ≤2.0: 1.00; 2.5: 0.95; 3.0: 0.85; 4.0: 0.70; 5.0: 0.60; 6+: 0.50. CPM +10–20% as CTR decays | Both | [design], thresholds 2.5–3.0 and 20–30% CTR-drop signal from [Segwise](https://segwise.ai/blog/how-to-measure-creative-fatigue) |
| Landing page CVR (visit → signup/trial) | All-industry median 6.6%; SaaS 3.8%; paid SaaS traffic 2–3%; app store page tap→install 66% (ASA) / 25–35% (social) | Both | [Unbounce 2024](https://unbounce.com/conversion-benchmark-report/saas-conversion-rate/); social store CVR [design] |
| Learning phase exit | 50 optimization events / ad set / 7 days (possible lighter 10 in 3 days); 3–7 days if budget ≥7×CPA/day, 7–14 days typical; "learning limited" CPA +20–40% [design] | Both | [Meta docs](https://developers.meta.com/horizon/resources/launch-ad-campaign/); [Jon Loomer 2025](https://www.jonloomer.com/updates-to-meta-sales-campaigns/) |
| Google Smart Bidding / PMax readiness | ≥15–30 conv/30 days; PMax evaluate after 6 weeks; 1–2 weeks relearn after changes | Both | [Google Ads Help](https://support.google.com/google-ads/answer/11385582); [GrowthSpree 2026](https://www.growthspreeofficial.com/blogs/b2b-saas-google-ads-bid-strategy-conversion-benchmarks-2026-manual-cpc-vs-target-cpa-vs-troas-vs-max-conversions) |
| Budget scaling penalty | Increase ≤20%/day: no reset, CPA +0–5%; 20–50%: 50% chance re-enter learning, CPA +10–25% for 3–5 days; >50%: reset, CPA +25–50% for ~1 week. Plus diminishing returns CPA ∝ spend^0.2–0.3 | Both | [design], rule of thumb 20–30% from [Stackmatix](https://www.stackmatix.com/blog/ad-learning-phase-small-budgets), [Jetfuel 2026](https://jetfuel.agency/what-is-the-meta-ads-learning-phase-how-to-exit-it-faster-in-2026/) |
| Attribution window effects | Reported conv. = true × (7d click+1d view: 0.75–0.9 web / 0.5–0.8 iOS app via SKAN), delayed 24–72h on iOS; switching to click-only −15–30% | Both | [design]; removal of 7d/28d view ([PPC Land 2025-10/2026-01](https://ppc.land/meta-restricts-attribution-windows-and-data-retention-in-ads-insights-api/)); vendor drop estimates 15–40% |
| UGC cost per video | Human $150–$300 (median ~$175); premium $500+; whitelisting +20–30% of fee per 30 days; AI UGC $5–$30; founder video $0 | B2C mainly | [Influee 2026](https://influee.co/blog/ugc-price); [IMH](https://influencermarketinghub.com/whitelisting-and-spark-ads/); [Segwise 2026](https://segwise.ai/blog/ai-ugc-vs-human-ugc-meta-ads-roas-2026) |
| AI UGC performance vs human | CTR 0.85–1.10×; post-click CVR 0.7–1.0× (worse for >$75 or trust-heavy products) | B2C | [Segwise 2026](https://segwise.ai/blog/ai-ugc-vs-human-ugc-meta-ads-roas-2026); [RevenueCat](https://www.revenuecat.com/blog/growth/ad-generated-ads-ugc); [Moburst](https://intercept.moburst.com/ai-avatar-ads-vs-real-creators-which-wins-on-meta/) |
| Install → trial start (D30) | 4–9% (median NA 7.1%); hard paywall with trial up to ~12% | B2C app | [RevenueCat SOSA 2026](https://www.revenuecat.com/state-of-subscription-apps); [Adapty 2025](https://adapty.io/blog/state-of-in-app-subscriptions-2025-in-10-minutes/) |
| Trial → paid by length | ≤4 days 25.5%; 5–9 days 37.4%; 17–32 days 42.5% (region: NA 34%, IN/SEA 15%) | B2C app | [RevenueCat SOSA 2026-03](https://www.revenuecat.com/state-of-subscription-apps) |
| B2B SaaS trial → paid | 15–25% opt-in (no card) typical; card-required trials higher | B2B | Not researched here; see other research docs. [design placeholder] |
| Download → paid (D35) | median 2.0%; hard paywall 10.7% (top quartile 20%); freemium 2.1% | B2C app | [RevenueCat SOSA 2026](https://www.revenuecat.com/state-of-subscription-apps) |
| Refund rate | 2–3% median (US iOS 2.71%); annual 4–7%; weekly ~2.6% | B2C | [Adapty 2025](https://adapty.io/blog/refund-rate-metrics-and-benchmarking/) |
| Monthly plan churn curve (share still paying) | M1 100%, M2 55% (category 42–61%), M3 ~43%, M6 ~28%, M12 ~17% | B2C | First renewal [RevenueCat 2026](https://www.revenuecat.com/blog/growth/average-subscription-renewal-rates-by-app-category); M3/M12 [Adapty 2025](https://adapty.io/blog/state-of-in-app-subscriptions-2025-in-10-minutes/); M6 interpolated [design] |
| Weekly plan churn | ~35% at D30 (42% with trial), ~5% at 1 year | B2C | [Adapty 2025](https://adapty.io/blog/state-of-in-app-subscriptions-2025-in-10-minutes/) |
| Annual plan renewal | First annual renewal 23–40% by category (median ~28–30%); auto-renew-off: 35% of cancels in Month 1 | B2C | [RevenueCat 2026](https://www.revenuecat.com/blog/growth/average-subscription-renewal-rates-by-app-category); [PPC Land on SOSA Part 2, 2026-05](https://ppc.land/95-of-annual-app-subscribers-who-cancel-never-return-revenuecat-finds/) |
| Plan mix | monthly ~42%, yearly ~34%, weekly/other remainder (weekly up to ~50% in some panels) | B2C | RevenueCat 2026; Adapty 2025 |
| Cohort revenue ratios per payer (D0 : D30 : D365) | Annual-plan payer 1.0 : 1.0 : 1.0 (cash up front; minus refunds); monthly payer 1.0 : ~1.55 : ~3.5–4.5 | B2C | [design] derived from the churn curve above; consistent with RevenueCat RPI D14 $0.23 → D60 $0.34 |
| ROAS curve targets (paid UA) | D7 15–30%, D30 40–70%, D90 70–110%; payback target ≤12 months (bootstrapped ≤3–6) | B2C app | [Segwise 2026 (vendor)](https://segwise.ai/blog/roas-benchmarks-industry-standards.md) |
| B2B CAC payback | median ~16 months (2025 data); SMB/self-serve 8–12 months; top quartile ≤6 | B2B | [Aleph × Benchmarkit 2026](https://www.getaleph.com/answers/cac-payback-period-saas-2026) |
| Friends/network conversion | Personal network outreach: 20–40% try it, 0–5% pay unless they are in the ICP (then 5–15%); expect 0–3 paying customers from a 150-person network | Both | [design]; anecdotes from [Indie Hackers](https://www.indiehackers.com/post/how-did-you-get-your-first-paying-customer-1ccf1f0ea7) — no systematic data exists |
| Launch-day spike (PH etc.) | 300–1,000 signups for a top-10 PH launch, ~60% in first 24h, paid conversion 0.25–2% | Both | [Indie Hackers 2025](https://www.indiehackers.com/post/400-signups-from-product-hunt-1-paying-customer-what-4-days-taught-me-about-launch-vs-traction-7c0aacf745); [LaunchList 2026](https://app.getlaunchlist.com/blog/how-to-launch-on-product-hunt-2026); ranges [design] |
| K-factor | typical 0.1–0.25; good referral program 0.4–0.7; >1 only as rare temporary event | Both (B2C higher) | [Saxifrage](https://www.saxifrage.xyz/post/k-factor-benchmarks); [LaunchList](https://getlaunchlist.com/glossary/viral-coefficient) |
| Organic SEO ramp | First meaningful traffic 4–6 months (long-tail), 12–24 months competitive; only ~2% of new pages reach top 10 in year 1; AI Overview CTR multiplier 0.4–0.5 on informational queries | Both | [Ahrefs 2025](https://ahrefs.com/blog/how-long-does-it-take-to-rank/); [Ahrefs AIO 2025-12](https://ahrefs.com/blog/ai-overviews-reduce-clicks-update/); [Seer 2025-11](https://ppc.land/google-ai-overviews-reduce-organic-ctr-61-paid-traffic-68/) |
| LLM/AI referral traffic | 0.3–1% of traffic; conversion 1.3–5× organic | Both (B2B higher) | [Ahrefs 2026-03](https://ahrefs.com/blog?p=196969); [AirOps](https://airops.com/blog/ai-referral-traffic-conversion-rates) |
| LinkedIn organic link penalty | posts with external links reach −20% to −50% | B2B | [Ordinal](https://www.tryordinal.com/blog/linkedin-link-penalty-study) |
| App store fee | Apple 30% / 15% (small biz <$1M or subs after year 1); Google 15% subs; US external link 0% (until court sets cost-based rate); web Stripe ~2.9%+$0.30 or MoR ~5%+$0.50 | B2C app | [Fenwick 2025-12](https://www.fenwick.com/insights/publications/ninth-circuit-largely-upholds-ruling-in-epic-v-apple); Apple/Google developer terms |
| Web checkout share of revenue | 3–5% average; 41% of top-tier apps use web | B2C app | [RevenueCat SOSA 2026](https://www.revenuecat.com/state-of-subscription-apps) |
| Median subscription app revenue | ~$72/month 1 year after launch; 17% reach $1k/mo, 4.6% $10k/mo within 2 years | B2C app | [RevenueCat SOSA 2026](https://www.revenuecat.com/state-of-subscription-apps) |
| Cost per install, Meta iOS subscription | $5–$12 (median $7.80 H&F); cost per trial ≈ CPI / install→trial (e.g. $40–$150) | B2C app | [RocketShip HQ](https://www.rocketshiphq.com/?p=5516); derived |
| B2B cost per trial/lead (Google) | self-serve trial $50–$200; CPL $100–$250 | B2B | [Redefine Web](https://redefineweb.com/blog/saas-ppc-case-studies/); [Saas Hero 2025](https://www.saashero.net/google-ppc/b2b-lead-gen-cost-2025/) |

---

## Sources
- RevenueCat, State of Subscription Apps 2026 (2026-03-19, Part 2 2026-05-28): https://www.revenuecat.com/state-of-subscription-apps ; https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026 ; https://www.revenuecat.com/blog/growth/average-subscription-renewal-rates-by-app-category ; https://www.revenuecat.com/blog/growth/ad-generated-ads-ugc
- PPC Land on RevenueCat SOSA Part 2 (2026-05-31): https://ppc.land/95-of-annual-app-subscribers-who-cancel-never-return-revenuecat-finds/
- Adapty, State of In-App Subscriptions 2025 (2025-07-16): https://adapty.io/blog/state-of-in-app-subscriptions-2025-in-10-minutes/ ; refunds: https://adapty.io/blog/refund-rate-metrics-and-benchmarking/
- Meta attribution changes: https://ppc.land/meta-restricts-attribution-windows-and-data-retention-in-ads-insights-api/ ; https://ppc.land/meta-rewrites-click-attribution-rules-finally-aligning-with-google-analytics/ ; https://www.dataslayer.ai/blog/meta-ads-attribution-window-removed-january-2026
- Meta learning phase: https://developers.meta.com/horizon/resources/launch-ad-campaign/ ; https://www.jonloomer.com/updates-to-meta-sales-campaigns/ ; https://www.stackmatix.com/blog/ad-learning-phase-small-budgets ; https://jetfuel.agency/what-is-the-meta-ads-learning-phase-how-to-exit-it-faster-in-2026/
- Meta CPM: https://www.superads.ai/facebook-ads-costs/cpm-cost-per-mille/marketing-advertising ; https://www.superads.ai/facebook-ads-costs/cpm-cost-per-mille/saas-cloud-platforms ; https://triplewhale.com/blog/facebook-ads-benchmarks ; https://admakeai.com/blog/cost-per-impression-cpm-explained ; https://affectgroup.com/blog/meta-ads-cpm-in-the-us-2025-benchmarks-for-facebook-and-instagram/
- Creative: https://motionapp.com/library/research/creative-benchmarks-2026/winners-are-rare ; https://opascope.com/insights/facebook-ads-creative-testing/ ; https://pipeboard.co/guides/creative-volume-andromeda ; https://admanage.ai/blog/what-is-a-good-hook-rate-for-facebook-ads ; https://billo.app/blog/hook-rate-to-hold-rate ; https://billo.app/blog/creative-fatigue/ ; https://segwise.ai/blog/how-to-measure-creative-fatigue
- UGC: https://influee.co/blog/ugc-price ; https://influencermarketinghub.com/whitelisting-and-spark-ads/ ; https://segwise.ai/blog/ai-ugc-vs-human-ugc-meta-ads-roas-2026 ; https://intercept.moburst.com/ai-avatar-ads-vs-real-creators-which-wins-on-meta/
- Google Ads: https://www.wordstream.com/resources/google-ads-industry-benchmarks ; https://support.google.com/google-ads/answer/11385582 ; https://www.involvedigital.com/insights/google-ads-b2b-saas ; https://www.saashero.net/google-ppc/b2b-lead-gen-cost-2025/ ; https://redefineweb.com/blog/saas-ppc-case-studies/
- TikTok: https://influee.co/blog/tiktok-ads-benchmarks ; https://ttcalculator.net/learn/tiktok-advertising-rates-benchmarks/
- Apple Ads: https://splitmetrics.com/apple-ads-search-results-benchmarks-2026/executive-summary
- LinkedIn: https://metadata.io/b2b-advertising-benchmarks ; https://www.tryordinal.com/blog/linkedin-link-penalty-study
- Landing pages: https://unbounce.com/conversion-benchmark-report/saas-conversion-rate/
- Subscription app UA: https://www.rocketshiphq.com/?p=5516 ; https://segwise.ai/blog/roas-benchmarks-industry-standards.md
- B2B payback: https://www.getaleph.com/answers/cac-payback-period-saas-2026
- Epic v. Apple: https://www.fenwick.com/insights/publications/ninth-circuit-largely-upholds-ruling-in-epic-v-apple ; https://appcharge.com/blog/apple-commission-ban-partially-overturned-but-nothing-changes-for-developers-yet ; https://macrumors.com/2026/06/11/apple-fights-back-against-epic/
- SEO/AI search: https://ahrefs.com/blog/ai-overviews-reduce-clicks-update/ ; https://ppc.land/google-ai-overviews-reduce-organic-ctr-61-paid-traffic-68/ ; https://ahrefs.com/blog/how-long-does-it-take-to-rank/ ; https://ahrefs.com/blog?p=196969 ; https://airops.com/blog/ai-referral-traffic-conversion-rates
- Organic/launch: https://www.saxifrage.xyz/post/k-factor-benchmarks ; https://getlaunchlist.com/glossary/viral-coefficient ; https://app.getlaunchlist.com/blog/how-to-launch-on-product-hunt-2026 ; https://mysignature.io/blogproduct-hunt-launch/ ; https://www.indiehackers.com/post/400-signups-from-product-hunt-1-paying-customer-what-4-days-taught-me-about-launch-vs-traction-7c0aacf745 ; https://www.indiehackers.com/post/how-did-you-get-your-first-paying-customer-1ccf1f0ea7
- Email sender rules: https://support.google.com/a/answer/81126
