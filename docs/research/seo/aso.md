# App Store Optimization (ASO) for subscription apps: research for the simulator

Scope: Apple App Store and Google Play. Date: 2026-10-15. Tags: [P] primary source (Apple/Google docs), [V] vendor or data study (AppTweak, SplitMetrics, RevenueCat, NP Digital), [unverified] secondary or no method disclosed, [design] our estimate. Vendor blogs sell tools or services, so treat their numbers as directional. Several vendor pages contradict themselves; contradictions are noted where they matter.

---

## PART A. Audit of what the game simulates today (read-only)

**What exists (B2C companies only)**
- Single "App Store" organic channel, `organic:appstore`, shown only when `company.model === 'b2c'` (`public/apps/organic.js:56`, tab at `:43`, source label `:44`).
- Daily installs = `ramp * clamp(baseInstalls 25 * starIndex(stars) * ratingsScale(reviews) * asoMult(asoScore), 0.05, 30)`, times `demandMult(state,'appstore')` (`public/apps/growth/organicModel.js:161-174`, `organicEngine.js:283-299`). The ramp is linear over 60 days (`params.js:240`). `DEMAND_EXP.appstore = 1.5` is an explicit "rich get richer" install-velocity exponent (`params.js:231`).
- `starIndex`: 1★ 0.20, 2★ 0.35, 3★ 0.57, 4★ 0.83, 5★ 1.00, sourced to NP Digital 2024 (`params.js:246`, `organicModel.js:163`).
- `ratingsScale`: 8% of the stream at 0 ratings, linear to 100% at 20 ratings (`params.js:242`, `organicModel.js:167`). `reviewCountMult` exists (`organicModel.js:164`) but `appStoreInstalls` does not call it, so `countMult` is dead data (`params.js:247`).
- `asoMult`: no listing = 0.03; listing score 0..1 maps linearly to 0.6..1.5 (`organicModel.js:165`, `params.js:248`).
- Installs convert to trials via `landingConversion * installIntent 1.4` (`organicEngine.js:293`).
- Ratings: installers rate at 0.2% (no prompt), 2% (`after_aha`), 1.5% (`on_open`); mean stars = `2.6 + 2.2*fit + promptShift` (after_aha +0.25, on_open -0.45) (`organicModel.js:176`, `params.js:244-245`, `organicEngine.js:296-298`). `on_open` logs a mistake with reputation -2 (`organicEngine.js:303`). The UI says Apple caps prompts at 3 per user per year (`organic.js:241`) but nothing enforces or models the cap.
- ASO listing form: title 30, subtitle 30, keywords 100, description (`organic.js:244-251`); costs 1.5 founder hours (`organic.js:267`), rating prompt change costs 1 hour (`organic.js:257`).
- ASO judge: `ASO_CRITERIA` rubric with 6 criteria (title clarity 0.2, subtitle benefit 0.2, keyword field 0.25, description hook 0.15, audience match 0.1, guideline safety 0.1) (`rubrics.js:105-118`). LLM panel plus deterministic fallback `asoHeuristic` (`judges.js:387-414`, `judgeAso` `:415-431`). Stuffing subtracts 0.4 from the score.
- Apple Search Ads in the ads app: CPT $2.25, TTR 9.7%, tap to install 66%, intent 1.4, 95% attribution, product page is the ad (`params.js:60-72`, `ads.js:336,345`, `adsEngine.js:97`).

**What it does not simulate**
- No keyword-level model. No search volume, difficulty, rank, or competitors per keyword. The listing is one score. The judge cannot check whether the terms are real queries.
- No product-page conversion rate. Listing quality changes the visit stream (`asoMult`), never the view-to-install rate. No screenshots, icon, video, Product Page Optimization (PPO), Custom Product Pages (CPP), or Google Play listing experiments.
- No Google Play at all (one "App Store"). No Android vitals, no Play-specific indexing (full description), no Play/App Store split in conversion or billing failures.
- No localization (markets, languages, cost, lift).
- No metadata change friction. Apple name, subtitle and keyword changes ship with an app version and go through review, and keyword ranks take days to weeks to settle; the sim applies the new score the same day. No update cadence, no decay, no competitor drift.
- Ratings: no 4.0 threshold effect, no review replies, no rating reset, no prompt cap enforcement (3 per 365 days), no review bombing, no fake or incentivized review risk, no `?action=write-review` link.
- Installs are hard-capped at 30/day (`params.js:240`), so top-quartile ASO cannot outgrow the median beyond the asoMult spread (0.6 to 1.5 = 2.5x). Real featured or chart-climbing apps are far larger.
- No search vs browse vs referral split, no featuring, no in-app events, no seasonality.
- Paid/organic interplay: ASA installs do not feed organic velocity or ratings, and there is no brand-keyword cannibalization. No Google App Campaigns.
- No ASO tool spend, no agency or specialist hire, no policy rejection with delay. Stuffing only lowers the score.
- Store fee (15/30%) is not in the ASO app; it appears only in classic playbook text (`public/classic/playbook.js:507`) and a world event (`public/data/world.js:314`).

---

## PART B. Research

### 1. Ranking and discovery

**Indexed metadata**
- Apple search relevance uses app name, subtitle, the keyword field, and primary category (secondary category too); behavior signals include downloads and ratings/reviews. [P: developer.apple.com/app-store/search/]
- Limits [P: Apple product-page docs]: name 30, subtitle 30, keywords 100 characters (comma-separated, no spaces), promotional text 170 (not indexed, cannot hold keywords), up to 10 screenshots and 3 previews of up to 30 s, up to 20 in-app purchase/subscription items, IAP display name 35 and description 55. In-app purchase names and the developer name are widely reported as indexed [unverified: no Apple statement found, confirm in current docs].
- Apple keyword tips [P]: do not repeat words already in name/subtitle/category; skip plurals of words already used, generic words ("app", "game"), filler words and special characters; no trademarks, competitor names, celebrity names. Custom product pages can be assigned keywords so they show for those terms (one keyword combination maps to one page).
- Google Play [P: Play Console metadata policy]: title 30, short description 80, full description 4,000 characters. Play indexes the full description (unlike Apple, which does not index the long description). Google does not publish the ranking formula; vendors list title, short and full description, developer name and package name. [V/unverified]
- Keyword strategy [V consensus, design]: pick terms with enough volume and low enough competition for the app's authority. A new app with no ratings should favour long-tail and specific phrases; head terms ("meditation") are only reachable with velocity and ratings. Apple says popular terms are "highly competitive, especially for newer or smaller apps." [P]

**Ranking signals**
- Apple names downloads and ratings/reviews as user-behavior signals; no weights are published. [P]
- Correlation only: among the top 1,000 US App Store apps, average top-10 keyword rankings were 4.4 for 4-star apps, 3-star 2.2, 1-star 1.3. [V: AppTweak ASO Trends 2025, correlational]
- Install velocity (recent, not lifetime) and engagement/retention are widely cited for both stores. [V/unverified, vendors only]
- Google Play: Android vitals feed visibility. Thresholds: user-perceived crash rate 1.09% overall, ANR 0.47% overall, 8% per phone model; exceeding them can exclude the app from some discovery surfaces and show a store-listing warning. [P: developer.android.com/vitals, Google blog Oct 2022]
- Featuring correlates with quality: about 95% of featured App Store apps are rated 4.0+, 65% 4.6+; under 5% of featured apps are under 4 stars. [V: AppTweak 2025]
- Updates: 38% of top App Store apps and 43% of top Play apps did not change their description in 2025; 54% / 46% updated screenshots 2+ times; 69% changed no icon, 74% no title. [V: AppTweak 2025]. Treat metadata as slow-moving, screenshots as the frequent lever.

**Search vs browse vs referral**
- Apple's long-quoted claim is about 65% of downloads come from search. Best public breakdown (Sensor Tower, 2017-18, old): search 69% of non-game and 56% of game installs; browse 9% non-game and 24% games. [V, dated; 2026 repeats of 65-70% have no primary source: unverified]
- Counterpoint: much "search" volume is brand-name queries; a small app's generic-keyword share is far smaller. [unverified, InMobi]
- [design] A new, unknown subscription app: brand/direct and referral (web link, social, friends) dominate; generic search is a minority until ratings and velocity exist. Planning split for a no-name app in its first 90 days: search 35-50% (mostly long-tail and brand), browse under 5%, referral/web 45-60%.
- Conversion at the install level: AppTweak 2025 US average product-page conversion 8.56% (App Store) and 16.15% (Google Play) from page view to download; "install rate" from search/browse impressions 3.8% (App Store). [V: AppTweak 2025; the page contradicts itself in places]

### 2. Conversion

**Benchmarks**
- App Store product-page CVR ranges from 5.2% (Games-Trivia) to 52.8% (Food & Drink) across categories; Google Play 6.6% to 62.3%. Averages above. [V: AppTweak 2025, "handle with caution"]. A Webtonic figure of about 1.6% default CVR attributed to Apple could not be verified. [unverified]
- Paid search tap-to-install (ASA, US): Health & Fitness 50.3%, Productivity 56.5%, Education 56.4%, Lifestyle 54.8%, Finance 50.7%, Photo & Video 67.5%; overall about 56% (AppTweak) to 66% (SplitMetrics 2025). [V]
- Download to trial (day 30) median 7.1% North America, 5.0% Western Europe (5.7% APAC); download to paid median 2.0% overall, 2.6-2.8% North America (report inconsistent), hard paywall 10.7% vs freemium 2.1%; trial to paid median 34.2% North America. [V: RevenueCat State of Subscription Apps 2026]. This is what happens after the install, and it is the part the existing game already uses through `landingConversion`.

**Creative and tests**
- Apple PPO: tests icon, screenshots and previews of the default page only, up to 3 treatments, traffic split among eligible users, results in App Analytics, winner can be set as default; more treatments take longer to reach a conclusion. [P: Apple docs, App Store Connect Help]. Up to 90 days per test is reported by secondary sources. [unverified]
- Custom Product Pages: separate URLs for ads, social, and keyword assignment; different screenshots, previews and promo text, localizable. Count limits conflict across sources (35 vs 70). [unverified, confirm in App Store Connect Help]
- Measured CPP effect: ASA tap-to-install 58.7% with CPP vs 55.5% default for apps (+3.2 points, about +6% relative); games +2.8 points. 61% of apps in Apple Ads run no CPP; 20% use them more than 5 times in a year. [V: AppTweak 2025]. A claim of "up to 8.6% lift" for CPP users appears in the same report. [V]
- Google Play: store listing experiments, one default-graphics experiment or up to 5 localized experiments at once; custom store listings for audience segments. Only 18.6% of top US apps run a custom store listing. [P: Play Console help via search summary; V: AppTweak 2025]. Experiment duration advice: at least 7 days. [P, older Google best-practice page]
- Testing is rare: about 90% of top App Store apps never A/B tested an icon; 88% never tested a video; 35% ran 2+ screenshot tests. [V: AppTweak 2025]. So even basic testing is a differentiator.
- No independent lift distribution was found for screenshots/icons. [design] Typical single test outcome: median test is a null or under 5%; roughly 1 in 4 to 1 in 3 tests produces a win of 5-15% relative; a full redesign of a weak page can reach +20-30% relative. Cumulative gain for an operator who keeps testing for a year: +15-35% CVR.
- Localization: the commonly quoted figure is Distimo (now part of data.ai) +128% downloads per country added and +26% revenue per country from localizing text. Old study, original not found. [unverified, secondary via Foxdata]. 92% of top App Store apps localize subtitle and description, 71% titles. [V: AppTweak 2025]
- In-app events (Apple) and promotional content (Play): Apple counts event impressions and downloads separately in App Analytics. Reported lifts are agency anecdotes: Phiture >50% more impressions/first downloads during events; Tilting Point 12x impressions and 2.4x installs for featured games but only +16% impressions and +30% installs for non-featured games. [unverified, no control group]. 51% of top games run more than 5 events a year; 38% of top apps. [V: AppTweak 2025]. [design] An unfeatured event on a small app: +5-15% impressions during the event window, nothing durable.

### 3. Ratings and reviews

- `SKStoreReviewController.requestReview(in:)` and SwiftUI `requestReview`: the system shows the prompt at most 3 times per 365 days per user and decides whether it appears at all. Ask after a positive moment, never on first launch, never tie to a button or gate features. A permanent "Write a Review" link uses `?action=write-review`, which is not rate-limited. [P: Apple StoreKit docs; the fetch tool returned summary only, 3/365 is long-established but re-check the live page]
- Apple guideline 3.2.2(x): apps must not force users to rate or review to access functionality. Guideline text also states that manipulating reviews or charts with paid, incentivized, filtered or fake feedback can lead to expulsion from the Apple Developer Program. [P: App Store Review Guidelines]
- Star effect on conversion: NP Digital (2024, 49 companies) 5★ = 1.00, 4.5★ 0.96, 4★ 0.83, 3★ 0.57 (what the game uses). A Spiegel-style purchase-likelihood peak is around 4.0-4.7 for web commerce; for app stores a drop below 4.0 is the commonly claimed cliff, with practitioner claims of 20-30% fewer installs from 4.5 to 4.0 and "half" below 4.0. [V for NP Digital; unverified for the 20-50% claims]
- Rating count matters for credibility; the game's 20-rating cold start is a [design] choice. Apple shows the average only after a minimum count (reported as 5 ratings per storefront) [unverified]. Few ratings in a market leave the listing without a star display.
- Rating reset: a developer can reset the summary rating on a new version; irreversible, applies to all storefronts, product page shows a "recently reset" notice, written reviews stay. Default is to keep ratings across versions. [P: App Store Connect Help]
- Developer replies: Apple and Google allow public responses; users may update their rating after a reply. No reliable study of the size of the effect was found. [unverified]. [design] Replying to the bottom 1-3★ reviews within 48 hours recovers a small share of ratings (5-15% revise upward) and shows the page visitor a responsive developer; the main gain is that it slows churn from billing complaints and bug reports.
- Review bombing and competitor sabotage: reported mainly for popular apps; both stores allow reports and removal of policy-violating reviews. No quantified rate found. [unverified]
- Rating prompt rates and skew in the game (0.2%/2%/1.5% of installers, +0.25 or -0.45 stars) are [design]. Reported prompt-to-rating response rates are often 1-5% of those shown the prompt [unverified]. Stars typically skew polarized: happy users rate when prompted at a success moment, unhappy ones volunteer in the store.
- Involuntary billing failures: 14% of cancellations on App Store vs 31% on Google Play (RevenueCat 2026), so Play is a worse retention platform for the same app. [V]

### 4. Paid and ASO interplay

- Apple Search Ads (now "Apple Ads"). US 2025 medians by category (AppTweak): Health & Fitness CPT $1.68, CPI $3.77; Productivity $1.74 / $3.58; Education $1.52 / $2.91; Lifestyle $1.18 / $2.62; Finance $4.17 / $9.65; Photo & Video $1.61 / $2.79. Global median CPT about $0.92, CPI about $1.80. [V]. SplitMetrics 2025: average CPT $2.25 across the top 15 categories (Sports $14.41, Finance $6.06, Medical $4.45), TTR 9.7%, conversion 66.2%; July 2026 medians CPA $2.76, TTR 8.2%. [V]. The game's CPT of $2.25 matches SplitMetrics but is above AppTweak's category medians for most subscription categories; [design] use $1.20-$4.20 depending on category and keyword type.
- Seasonality: CPT is lowest early in the year and rises toward the holidays; peak about +8.8% in November for generic campaigns. Apple added search ads placements in March 2026; Discovery campaigns saw impressions +44.9% and installs +35.8% over 28 days in one dataset. [V: AppTweak 2025/2026]
- Median ASA CPI for Shopping $1.33, Games $4.63, Sports $26.70. [V]. Overall US iOS CPI across networks about $5.28, Android about $1.22 (tool-vendor figures). [unverified]
- Halo effect: no rigorous public incrementality study exists. Vendor case studies (Canva reports blended US CPI down 40% when counting organic lift; Kanmu saw organic conversion +5% during campaigns) are anecdotes. Brand-keyword campaigns are widely suspected of capturing installs that would be organic anyway; the clean test is turning the campaign on/off or a geo holdout. [unverified]
- [design] Planning values: paid installs raise organic ranking velocity slightly (about +0.1 to +0.3 organic installs per paid install for a brand-new app with no ranking, which fades after ratings build); brand-keyword campaigns have 30-70% cannibalization; generic and competitor keywords have under 20%.
- Google App Campaigns: automated across Search, Play, YouTube, Display. No reliable public 2026 CPI table by category was found; RocketShip HQ says App Campaigns run higher CPI than Meta for most categories. Sample figures (unverified, no dataset): US Android CPI casual games $1.90, shopping $2.35. [unverified]. Use average Android CPI about $1.2-$2.5 and iOS $3-$6 for subscription apps as [design] ranges.

### 5. Tooling and 2026 prices (monthly USD unless noted)

| Tool | Price | Note |
|---|---|---|
| AppTweak | Essential about $79-99 (1 app, 1 country), Grow about $299, Pro/Grow Plus about $499-549; Capterra shows EUR 83/249/499; 7-day trial; API extra | Sources conflict on exact tiers and currency. [V] |
| AppFollow | Essential $139-179, Team $599, annual about -22%; 10-day trial | [V: AppFollow blog, vendor] |
| Sensor Tower | Quote-based; third-party estimates $79-399 for small plans; enterprise often $30K+/yr | [unverified] |
| MobileAction | Entry about $69, top bundle about $599 | [V] |
| Appfigures | Entry $7.99, top growth plan about $599 | [V] |
| App Radar | From about $69 (EUR 69-699) | [V] |
| Asodesk | About $41-53 entry to $200-400 pro | [V] |
| ASOTools.io | $9-299 | [V] |
| SplitMetrics Optimize | $1,000-5,000 per month for creative testing | [unverified] |
| data.ai | Absorbed into Sensor Tower; enterprise contract only | [unverified] |
| Astro (Mac app) | Not found | [unverified] |
| Free | App Store Connect Analytics (impressions, page views, CVR, PPO results), Google Play Console (store listing acquisition, experiments, vitals), Apple Ads search popularity (inside Apple Ads), manual store search autocomplete | [P] |

- Fixed fees: Apple Developer Program $99/year; Google Play developer account $25 one time. [P/V]
- Typical spending: indie under $500K ARR under $15K/yr total ASO budget; $500K-$3M ARR $25-80K; $3-15M ARR $80-250K; $15-50M $250-700K. [V: AppFollow, vendor budget guidance]
- [design] Indie solo founder: free Console tools plus one low-tier tool ($0-100/month, often a single month while researching).

### 6. Hours and team

Founder hours below are [design] unless noted; no primary time-study exists.
- Initial keyword research + metadata (name/subtitle/keyword field/description) for one locale: 6-12 h. Metadata refresh in a later cycle: 2-4 h. Apple requires a new app version to change name, subtitle and keywords, so add a release and review cycle (typically 1-2 days review) and then 1-4 weeks for ranks to settle. [design; review time unverified]
- Screenshot set (8-10 images + captions) in Figma or a screenshot tool: 8-16 h; with a freelancer $300-1,500, agency $3,000-12,000. Preview video $1,500-10,000. [V: AppFollow, vendor]
- Icon + screenshot A/B test: setup 2-3 h, wait 2-6 weeks for traffic, read result 1 h. A low-traffic app (under 50 views/day) cannot reach significance on a 3-treatment PPO test. [design]
- Localization: translating metadata $0.08-0.25 per word; refresh per locale $150-500; native QA $50-150 per language; full cultural adaptation $2,000-8,000 per market. [V: AppFollow, vendor]. Founder time: 3-6 h per locale to brief, review and upload.
- Review replies: 15-30 minutes a day once there are 10+ reviews a week. Rating prompt integration: 2-4 h (with AI coding agent 1-2 h). [design]
- Ongoing: 2-4 h/week of ASO care for a single app, or AppFollow's "DIY 8-20 h/week" for aggressive teams. [V/design]
- Hiring [V: AppFollow, vendor ranges]: freelance/boutique $1,500-4,000/month ($75-175/h); mid-market agency $5,000-15,000/month; enterprise (Phiture, Gummicube, SplitMetrics) $15,000-50,000+; one-off ASO audit $2,000-7,500; 90-day launch package $5,000-20,000. In-house ASO specialist $55-130K base, ASO manager $90-160K, fully loaded +25-40%. Quoted ROI logic: a $10K/month retainer needs about 4,000 extra installs/year at $30 LTV to break even.
- [design] Hire an ASO specialist or agency when organic store installs exceed about 1,000-3,000/day or store revenue exceeds about $300K-$1M ARR, or when 3+ locales/storefronts need maintenance. Below that, founder time plus a $79 tool wins.

### 7. Policy risks

- Apple guideline 2.3.7: do not pack metadata with trademarked terms, popular app names, pricing information or irrelevant phrases; Apple may modify keywords at any time or take action. Misleading marketing (2.3.1) is grounds for removal; egregious or repeated behavior can end Developer Program membership. [P]
- Common rejection causes named by Apple: improper keywords, competitor app names, unauthorized trademarks, celebrity names. [P: Apple search docs]
- Google Play title/developer name [P]: no "Free", "No Ads", prices or promotions, ranking claims ("#1", "Best of Play"), all caps, emoji, names implying another company. Keyword stuffing and repeated words in the description are disallowed. Anonymous testimonials in the description are disallowed.
- Fake reviews: Apple states it may expel developers who use paid, incentivized, filtered or fake feedback or third-party services for it. [P]. FTC Rule on Consumer Reviews and Testimonials (16 CFR Part 465, announced 2024-08-14, effective 2024-10-21 per publication timing; one summary says October 13, reconcile with the Federal Register) bans fake reviews, buying or selling reviews, and incentives conditioned on sentiment, with civil penalties per violation; an inflation-adjusted figure of about $51,744 per violation circulates, confirm in the current FTC notice. [V: law-firm summaries]
- Ranking consequences: Apple can strip keywords, hold an update, or remove the app. Cost for the sim [design]: stuffing or competitor names mean the update is rejected, a 1-3 week delay in lost iteration time, and a one-time rank penalty on repeat; fake reviews are low-probability, severe (app removal, account termination, legal/reputation hit).

### 8. Indie vs seed vs Series A [design, ranges mostly from section 5 and 6]

| | Indie ($0-500K ARR) | Seed ($0.5-3M ARR) | Series A ($3-15M ARR) |
|---|---|---|---|
| Owner | Founder, 2-4 h/week | Growth hire or part-time specialist, 8-15 h/week | ASO manager or pod (2-4 people) |
| Tools | Free consoles + $0-100 | $100-600/month | $1,000-5,000/month (suite plus SplitMetrics-class testing) |
| Tests | Rarely; low traffic | PPO / listing experiments 1 per month | CPPs per ad group, 2+ concurrent tests, event calendar |
| Locales | 1-2 | 5-10 for the top geos | 20-40 |
| Paid tie-in | ASA brand + a few generic keywords, $20-100/day | $500-3,000/day, CPP per keyword cluster | Multi-channel, MMP, incrementality tests |
| Annual spend | Under $15K | $25-80K | $80-250K |

### Stellar vs average vs mediocre ASO operator

| Dimension | Stellar | Good | Average | Mediocre |
|---|---|---|---|---|
| Keywords | Researched, long-tail first, distinct terms across name/subtitle/keyword field, 90-100 chars used, revisited every release | Good terms, a few duplicates | Brand + generic words, wasted characters | Stuffed, competitor names, pricing, repeats |
| Conversion | Screenshots tell a benefit story, tested icon and screenshots every cycle, CPPs per paid theme | One test per quarter | Default screenshots, never tested (about 90% never test an icon) | Dev screenshots, no tests |
| Ratings | Prompt after a success moment, cap respected, replies within 48 h, keeps 4.5+ | Prompt on a trigger, some replies | Prompt on a timer or none | Prompt on open, no replies, below 4.0 |
| Localization | Top markets with real adaptation | Translated metadata | English only | Machine-translated, wrong-market |
| Paid link | ASA to defend brand, CPP per keyword, measure incrementality | ASA with some cannibalization | ASA on brand only, no test | No ASA or all spend on brand |
| Policy | Clean | Clean | Occasional rejection | Stuffing, fake/incentivized reviews |
| Outcome gap [design] | Organic installs 2.5-4x the median at equal quality, CVR +25-40% relative | +1.5-2x installs, CVR +10-20% | Baseline | 0.3-0.6x installs, CVR -10-20%, rejections |

---

## Game-ready parameters

| Name | Value / range | Source | Confidence |
|---|---|---|---|
| Name / subtitle / keyword field limits | 30 / 30 / 100 | Apple docs | High |
| Play title / short / full description | 30 / 80 / 4,000 (full indexed) | Google Play policy | High |
| Rating prompt cap | 3 per user per 365 days | Apple StoreKit | High |
| App Store avg page CVR (US) | 8.56%; Play 16.15% | AppTweak 2025 | Medium |
| Subscription-category CVR | 15-35% iOS, 25-45% Play in typical Health/Productivity | [design] from category ranges | Low |
| Star-to-conversion index | 5.0=1.00, 4.5=0.96, 4.0=0.83, 3.0=0.57 | NP Digital 2024 | Medium |
| Sub-4.0 cliff extra penalty | additional x0.8 below 4.0 | practitioner claims | Low [design] |
| Ratings cold start | 8% of stream at 0, full at 20 | game params | Design |
| PPO | up to 3 treatments, default page only, 2-6 weeks at 50-300 views/day | Apple help; time [design] | Medium |
| CPP effect on paid tap-to-install | +3.2 points (about +6% relative) | AppTweak 2025 | Medium |
| Single creative-test win odds | null/under 5%: ~60%; +5-15%: ~30%; +15%+: ~10% | [design] | Low |
| Year of disciplined testing | +15-35% CVR | [design] | Low |
| Localization lift | +30-100% installs in a newly localized market vs English-only | Distimo via Foxdata (old) | Low |
| Metadata change friction | name/subtitle/keywords need new app version; review 1-2 days; ranks settle 1-4 weeks | design from Apple process | Medium |
| In-app event lift (unfeatured) | +5-15% impressions during window | agency anecdotes | Low |
| ASA CPT / CPI (US, subscription) | CPT $1.2-1.8, CPI $2.6-3.8 (Health, Productivity, Education, Lifestyle); Finance CPT $4.2 CPI $9.7 | AppTweak 2026 | Medium |
| ASA tap-to-install | 50-57% subscription categories; up to 67% Photo/Video | AppTweak 2026 | Medium |
| ASA brand cannibalization | 30-70% | [design], no study | Low |
| ASA to organic halo | +0.1 to +0.3 organic per paid install for a new app | [design] | Low |
| Search share of installs | 35-50% for an unknown new app (65% industry claim) | Apple claim; [design] | Low |
| Google Play vitals thresholds | crash 1.09%, ANR 0.47% | Google | High |
| Play billing failure share | 31% of cancels Play vs 14% App Store | RevenueCat 2026 | Medium |
| Download to trial (NA) / to paid | 7.1% / 2.6-2.8% | RevenueCat 2026 | Medium |
| Tool prices | $0 free consoles; $79-100 entry; $300 mid; $500-600 top; enterprise $30K+/yr | vendor pages | Medium |
| Agency / freelancer | $1.5-4K freelance; $5-15K agency; $15-50K enterprise per month | AppFollow (vendor) | Low-Medium |
| Founder hours | first metadata 6-12; screenshots 8-16; test 3-5; per-locale 3-6; weekly care 2-4 | [design] | Design |
| Fake/incentivized review | prob. of detection low, severity app removal + FTC exposure | Apple, FTC | High (rule), Low (probability) |

## Gaps in the current game, ranked by realism impact

1. Listing quality never changes conversion. Add view-to-install CVR (default ~8.5% iOS, 16% Play, category-specific) driven by screenshots, icon, video, rating, with PPO and CPP tests that need traffic, time and hours. Operator quality separates here more than in the keyword score.
2. The 30 installs/day cap and flat 25 base kill the stellar-vs-median spread. A great operator with a real keyword and rating edge should reach several times the median; the cap and asoMult (2.5x range) understate it.
3. No keyword-level model. Replace the single score with keywords that have volume, difficulty and a rank that depends on authority, ratings and velocity; the judge cannot detect fake volume today.
4. Ratings realism: enforce the 3-per-365 days cap, add the 4.0 cliff, review replies, rating reset, `write-review` link, and fake/incentivized review risk (Apple expulsion, FTC) as a tempting-but-costly choice.
5. Metadata friction: name/subtitle/keyword changes need an app release and review, ranks settle over weeks, and keyword stuffing or competitor names cause a rejection delay, not just a lower score (`judges.js:411`, `organicEngine.js:306`).
6. Paid/organic interplay: ASA installs should feed velocity and ratings, brand campaigns cannibalize, CPP per keyword raises tap-to-install; use category CPT/CPI instead of one $2.25.
7. No Google Play: indexed full description, vitals threshold, higher CVR, higher billing failure, custom store listings, experiments.
8. No localization lever (markets, cost, lift) and no in-app events/featuring.
9. Dead data and drift: `countMult` and `reviewCountMult` are unused (`params.js:247`, `organicModel.js:164`); the UI says "3-30 installs a day" while code allows 0.05 to 30.
10. No tooling or agency spend, and no scale triggers (when to hire a specialist).
