# O2: Marketing and growth operators (2026, small startups)

Scope: six sub-functions. Each has tier behaviours (stellar / good / average / mediocre), outcome spreads, traps, detection, one-line feedback, and sources.

Source-quality note: the benchmark evidence here is thin. Most published numbers come from vendors who sell the tool or service being benchmarked (Instantly, SaaSHero, Trendtrack, Triple Whale, Monetizely, Fungies, Prospeo). Where a number conflicts across sources, both are shown. Tags: [design] = our estimate for the simulator; [unverified] = secondary or vendor claim not checked against the primary report. Dates are the page or report date as seen; "n.d." = no date shown.

---

## 1. Positioning and landing pages / website conversion

### Tier behaviours
- **Stellar:** Writes the positioning as a specific buyer, a specific pain and a specific outcome, and tests the claim against 5 real customers before publishing. Names the category and the alternative the buyer uses today (spreadsheet, agency, competitor). Puts one primary CTA above the fold, matched to traffic temperature (demo for high-ACV, free trial or self-serve for low-ACV). Reads session recordings weekly and rewrites the hero after watching people hesitate. Sets a conversion-rate target per traffic source, not per page.
- **Good:** Clear headline and proof above the fold, one CTA, a fixed test cadence (one test every 2 weeks). Knows the page's conversion rate by source but not always by segment.
- **Average:** Copies a competitor's homepage structure. Feature-list hero ("AI-powered workflow platform"). Three CTAs ("Book demo / Start free / Contact"). Adds testimonials with no name or company. Tests colour and button text.
- **Mediocre:** Writes for "everyone who needs productivity." No clear price or next step. Asks for a demo before the buyer knows what the product does. Judges pages by feel or by a redesign; never sets a baseline. Launches with no analytics on the form.

### Outcome spreads
- B2B SaaS landing page conversion (visitor to lead). SaaSHero, "B2B SaaS landing page conversions" (updated 11 Jul 2026, https://www.saashero.net/strategy/b2b-saas-landing-page-conversions/): demo pages median 1.5–4%, top quartile about 4.8%. Self-serve/free-trial pages median about 8%, top quartile 12%+. A different SaaSHero table (https://www.saashero.net/content/2026-b2b-saas-conversion-benchmarks/, 27 Jul 2026) gives 4–10% median for self-serve, so the ranges disagree [unverified].
- Unbounce, 2024 Conversion Benchmark (Q4 2024 data, cited secondhand): SaaS/technology median 3.8%; all-industry median 6.6% (https://unbounce.com, cited by secondary roundups, n.d.) [unverified].
- Visitor-to-lead, SaaSHero 2026: median 1.4–2.5%, top quartile 8–15% [unverified].
- Spread that matters for the simulator: a 3–4x gap between median and top quartile is common on the same traffic. Most of it is copy and offer, not traffic quality [design].

### Common mediocre-operator traps
- Judging a page on total conversion rate across mixed traffic (paid, social, cold referral). Blended numbers hide that one source converts at 0.5%.
- Redesigning the whole site instead of testing one element at a time.
- Gating the only CTA behind a sales call on a $29/month product.
- Using "AI-powered" and "all-in-one" as the hero, which tells a buyer nothing.

### Detection
- Text signals: does the hero name a buyer, a pain and a measurable outcome? Count CTAs. Check whether pricing is findable without a form.
- Decision patterns: does the player run one test at a time with a stated hypothesis and a sample-size floor? Does the player look at per-source data?
- Timing: how quickly after launch does the player add analytics and a baseline? Stellar players do both before traffic.
- Cannot be gamed cheaply: whether the claim matches the product's real capability (checked against the simulator's product state), and whether a hypothetical test result is consistent with the traffic volume.

### Feedback (one line per trap)
- Blended conversion: "Report conversion by traffic source before you change anything; the number you have is an average of three different pages."
- Full redesign: "Change one thing, run it for two weeks, keep what moved the number."
- Sales-call gate on cheap product: "Put the price and a self-serve path next to the demo button, or you are asking a $29 buyer to schedule a meeting."
- Feature-list hero: "Say who it is for and what they stop doing, in the first line."

### Sources
- SaaSHero, B2B SaaS landing page conversions, updated 11 Jul 2026: https://www.saashero.net/strategy/b2b-saas-landing-page-conversions/
- SaaSHero, 2026 B2B SaaS conversion benchmarks, 27 Jul 2026: https://www.saashero.net/content/2026-b2b-saas-conversion-benchmarks/
- Unbounce benchmark (cited via secondary roundups): https://unbounce.com/?p=94299 [unverified]

---

## 2. Paid ads (creative testing, budgets, attribution)

### Tier behaviours
- **Stellar:** Sets a cost-per-qualified-outcome target from LTV and payback before spending (see saas-unit-economics). Runs a creative system: 5–10% of budget on new concepts in separate test ad sets, with hypotheses (hook, offer, format). Kills on pre-set rules (e.g., spend 2x target CPA with no conversion). Holds budgets steady and scales in steps. Runs a holdout or geo test to measure incrementality, and treats platform ROAS as an upper bound. Separates brand search and retargeting in reporting.
- **Good:** Tests 3–5 creative variants per concept, reads CTR and CVR by creative, scales the winner. Tracks CPA by channel. Does not run a holdout.
- **Average:** Launches one campaign with a single image. Changes budget daily based on yesterday's CPA. Turns off ads after a bad day. Reports "ROAS 4x" from the platform dashboard.
- **Mediocre:** Boosts posts. Runs "brand awareness" with no conversion goal. Changes targeting, bid, creative and budget in the same week. Spends on retargeting to show high ROAS. Never reads cost per trial or per paying customer.

### Outcome spreads
- Google Ads, WordStream/LocaliQ 2025 (16,000+ US advertisers, Apr 2024–Mar 2025, reported secondhand): CPC $5.26, conversion rate 7.52%. Search Engine Land reports a version with CPC $5.42 and CVR 8.18% for the same report family, so cite with care (https://searchengineland.com/google-ads-costs-keep-rising-but-conversion-rates-improved-in-2025-477927) [unverified].
- Google SaaS: one blog says SaaS CVR under 2% [unverified]. Treat as a bad-ads signal, not a benchmark.
- Meta, Trendtrack 2025 report (https://www.trendtrack.io/blog-post/meta-ad-spend-by-industry, 2025): B2B CPC $2.52, CTR 0.78%, conversion 10.63%, CPA $23.77; Technology CVR 2.31%, CPA $55.21 [unverified].
- Meta, AdRiseLab 2026 averages (secondary): SaaS CPC $3.00, CTR 0.60%, CPM $18.00 [unverified].
- Triple Whale 2025 (ecommerce, weak fit): median CTR 2.19%, CPA $38.17 (https://triplewhale.com/blog/facebook-ads-benchmarks, 2025) [unverified].
- Spread: CPA for the same product can vary 2–3x between a stellar and an average operator through creative and offer alone [design]. Platform choice and CPM are partly luck and market.
- Incrementality: platform-reported conversions overstate paid social impact. Gordon et al., Marketing Science 2019, found observational methods overstated lift against 15 Facebook experiments. An NP Digital dataset (Feb 2026) reports 17% lift vs 24% attributed conversions for paid social (https://neilpatel.com/marketing-stats/incremental-lift-by-channel/) [unverified]. Brainlabs (vendor, 17 studies) finds paid social drives about 19% more search visits [unverified].

### Common mediocre-operator traps
- Retargeting and brand-search ROAS presented as acquisition. These mostly capture demand that already existed.
- Learning-phase churn: editing budget or creative every 1–2 days, so the algorithm never exits learning. Meta guidance on the threshold (about 50 optimization events, timing unclear) is secondhand [unverified]; check Meta's Business Help Center before encoding it.
- Scaling a campaign 3x in one day after one good week.
- Using the platform's "conversions" column for a B2B free trial, which counts a signup that never activates.

### Detection
- Decision patterns: does the player set a CPA ceiling from unit economics before the first dollar? Does the player write kill rules in advance?
- Follow-through: number of concurrent creative tests, cadence of edits per campaign, whether the player logs results per creative.
- Text quality: ad copy that names the buyer's problem vs generic benefit words. Hook variety across variants.
- Cannot be gamed: whether the player reports cost per paying or activated customer or only per click. Whether a claimed holdout result is internally consistent with spend and volume.

### Feedback
- Retargeting ROAS: "Show me CPA on new-audience prospecting only; retargeting is paying for people who already knew you."
- Daily budget changes: "Pick a budget and a 2-week window, then judge the campaign on that window."
- Scale after one good week: "Raise the budget 20% at a time and watch CPA hold before you go further."
- Trial signup as conversion: "Optimise to activation or first paid, or the algorithm will find cheap signups that never use the product."

### Sources
- Trendtrack, Meta ad spend by industry 2025: https://www.trendtrack.io/blog-post/meta-ad-spend-by-industry
- Triple Whale, Facebook ads benchmarks: https://triplewhale.com/blog/facebook-ads-benchmarks
- WordStream/LocaliQ via Search Engine Land, 2025: https://searchengineland.com/google-ads-costs-keep-rising-but-conversion-rates-improved-in-2025-477927
- Gordon et al., Marketing Science, 2019 (cited via secondary): https://neilpatel.com/marketing-stats/incremental-lift-by-channel/ [unverified]
- NP Digital incrementality dataset, Feb 2026 (cited via secondary): https://neilpatel.com/marketing-stats/incremental-lift-by-channel/ [unverified]

---

## 3. Content, SEO/GEO and building in public

### Tier behaviours
- **Stellar:** Picks 10–20 buyer-question topics from sales-call transcripts and support tickets, not keyword tools alone. Writes one deep, sourced piece per month with original data (their own product data, a survey of 50 customers). Repurposes it into 5–8 posts. Builds comparison and "alternative to X" pages that answer buying questions. Checks whether ChatGPT, Perplexity and Google AI Overviews cite them for their core queries each month. Builds in public with specific numbers and failures, not highlights.
- **Good:** Publishes weekly, keyword-led, with reasonable on-page SEO. Tracks organic traffic and sign-ups. Posts on X or LinkedIn several times a week.
- **Average:** Publishes generic "ultimate guide" posts from AI tools. Little original data. Posts "hustle" updates without numbers. Measures impressions.
- **Mediocre:** Publishes 5 AI-written posts a week with no edit and no intent match. Buys backlinks. Posts once a quarter. Reports follower counts as progress.

### Outcome spreads
- Organic click-through depends on AI Overviews. Ahrefs, Dec 2025 data, published Feb 2026 (https://ahrefs.com/blog/ai-overviews-reduce-clicks-update/): position-1 CTR falls 58% when an AI Overview is present (0.073 in Dec 2023 to 0.016 in Dec 2025), and position 10 falls 19.4%. The April 2025 version of the same study reported a 34.5% reduction [unverified in the specific wording].
- Counterpoint, Semrush Datos clickstream (cited via secondary; Search Engine Land is owned by Semrush): zero-click rate moved from 38.1% to 36.2% for the same keywords [unverified]. The two studies measure different things, so the gap is method, not contradiction.
- Brand-building: no reliable tier spread for "building in public." Treat any follower-to-revenue ratio as [design].
- [design] Spread: a stellar content operator generates 3–5x the qualified pipeline per piece of work versus an average one, mostly from topic choice (buyer questions) and from comparison pages. Not a sourced number.
- GEO: the citation share for a brand in AI answers is volatile and not yet benchmarked publicly in a rigorous way [design].

### Common mediocre-operator traps
- Volume without intent. Publishing 40 posts on broad keywords that send readers who never buy.
- Measuring the wrong thing. Impressions and follower counts that rise while sign-ups stay flat.
- Assuming an AI-written article ranks. Thin, unedited output is the kind that gets de-indexed or ignored.
- Building in public without a point. A timeline of "shipped X" with no metrics or lessons.

### Detection
- Text signals: presence of specific numbers, named customers (with permission), a stated opinion, a failure. Specificity is the detectable feature.
- Decision patterns: does the player pick topics from customer language? Does the player plan a repurposing chain?
- Follow-through: number of posts actually shipped against the plan, and whether the player checks citations or rankings.
- Cannot be gamed cheaply: the simulator can check whether claimed numbers match the simulated company's real metrics. Generic posts can be flagged by lack of product-specific content.

### Feedback
- Volume without intent: "Write for the three questions a buyer asks before they pay, then stop."
- Impressions as progress: "Track sign-ups from content, by page. Impressions are a vanity number."
- Unedited AI posts: "Add a number, a customer quote or an opinion to every post or do not publish it."
- Building in public with no point: "Share one metric and one lesson per update, not a feed of tasks."

### Sources
- Ahrefs, AI Overviews reduce clicks, updated Dec 2025 data, published Feb 2026: https://ahrefs.com/blog/ai-overviews-reduce-clicks-update/
- Search Engine Land, AI Overviews and CTR: https://searchengineland.com/google-ai-overviews-hurt-click-through-rates-454428 [unverified]
- Semrush Datos study, via secondary blog: https://wholewhale.com/resources/googles-gaslighting-pew-research-confirms-what-seos-already-know-about-ai-overviews/ [unverified]

---

## 4. Launches, community and word of mouth / referrals

### Tier behaviours
- **Stellar:** Builds a waitlist or early-user group 4–8 weeks before launch, with a specific ask (feedback calls, beta testers). Launches in a sequence: personal network, then a niche community where the buyer already is (Reddit subreddit with rules read, Slack or Discord), then a broad launch. Responds to every comment in the first 24 hours. Designs a referral loop with a real reward and a measured k-factor. Asks customers for introductions by name, after a result.
- **Good:** Posts on Product Hunt and a few communities. Has a launch-day plan. Runs a simple referral or affiliate link.
- **Average:** Launches once to everyone at the same time. Posts in communities without reading the rules, gets removed. Affiliate program with no tracking.
- **Mediocre:** Buys upvotes or fake reviews (an FTC problem; see founder-support-and-reputation). Launches before the product is usable. Cold-DMs strangers with a link. Never follows up with first users.

### Outcome spreads
- Product Hunt, 2025 rank thresholds (practitioner guides, undated or 2026): #1 of the day needed about 1,200–1,800 upvotes, #4–10 about 300–600 [unverified]. A different newsletter puts a "good shot" at first place at 1,000–1,400 upvotes [unverified].
- Product Hunt distribution: an indie-hacker tally of one week found 89.6% of 5,639 launches never passed 10 votes; 2.1% passed 100 (https://www.indiehackers.com/post/the-median-indie-launch-last-week-got-3-upvotes-d1c2406a1f, undated) [unverified]. This is the strongest signal of a steep, mostly luck-independent cliff, and it supports the view that prep matters more than the launch day.
- Launch-day signups (Lenny's Newsletter, secondhand): B2B PH launches average 50–300 signups on launch day [unverified].
- Referrals (vendor blogs, 2025–2026): join rate 2–8% of active customers, 5–15% for startups; referred customers show 16–37% higher LTV [unverified]. Share of new purchases from referrals: median 2–5%, top quartile 10%+ [unverified]. These conflict with each other, so use ranges, not points.
- [design] Spread: a stellar launch sequence produces 3–10x the first-30-day signups of a single broad launch from the same product, mostly from pre-launch list size.

### Common mediocre-operator traps
- A single launch day treated as the whole go-to-market. Launch day is one spike.
- Buying upvotes, reviews, or fake referrals. Risks platform bans and FTC exposure.
- Posting the same link in ten communities with no value.
- A referral program with no reward the referrer wants, or no tracking, so the program never gets measured.

### Detection
- Decision patterns: does the player build a pre-launch list? Does the player choose communities by rule-reading and fit?
- Timing: launch sequencing and whether follow-up happens within 48 hours.
- Text quality: launch copy written for a specific user vs generic "excited to announce."
- Cannot be gamed: a referral reward and k-factor that match the simulated economics; vote and signup counts that match the simulated audience size.

### Feedback
- Single launch day: "Treat launch day as the one spike in a 6-week sequence; list size before launch decides most of the outcome."
- Buying upvotes: "Do not. The platform and the buyer both notice, and it costs you the trust launch depends on."
- Link in ten communities: "Post one useful thing per community and link only where the rules allow it."
- No referral tracking: "Give a reward the referrer wants, then count referred sign-ups for 30 days before you call it a program."

### Sources
- IndieHackers, median indie launch tally (undated): https://www.indiehackers.com/post/the-median-indie-launch-last-week-got-3-upvotes-d1c2406a1f [unverified]
- Screenhance, Product Hunt launch checklist 2026: https://screenhance.com/blog/product-hunt-launch-checklist-2026 [unverified]
- Fungies, SaaS referral program guide: https://fungies.io/saas-referral-program-guide [unverified]
- Monetizely, referral tracking guide: https://www.getmonetizely.com/articles/how-to-track-referral-program-effectiveness-a-complete-guide-for-saas-executives [unverified]

---

## 5. Pricing and packaging

### Tier behaviours
- **Stellar:** Prices from the value metric and the buyer's alternative, not from cost. Tests price with real buyers (Van Westendorp survey, then live A/B or new-cohort test). Launches at a price they can raise later, and raises existing prices with notice and grandfathering. Offers annual at a discount and tracks the annual mix. Reviews pricing twice a year. Adjusts price after AI cost or competitor moves, with a plan for the customers affected.
- **Good:** Three tiers, a clear "recommended" plan, annual discount, reviews pricing yearly. Discounts for non-profits or students with a policy.
- **Average:** Copies competitor pricing. Price set once and never changed. Free plan with no limits, so it cannibalises paid. Discount on request, no policy.
- **Mediocre:** Charges too low to fund support and inference. Adds a discount to every deal. Changes price on a whim and makes existing customers angry. Hides pricing behind "contact us" on a self-serve product.

### Outcome spreads
- Annual vs monthly churn: ProfitWell analysis of about 2,500 subscription companies (2019), annual plans lower churn because customers commit longer (https://paddle.com/studios/shows/profitwell-report/annual-vs-monthly, Jan 2019; Paddle notes it may be dated) [unverified for 2026].
- Paddle SaaS pricing survey, cited secondhand: firms reviewing pricing twice yearly see 13% lower churn [unverified].
- Price-increase churn: one Monetizely article (May 2025) cites a McKinsey analysis of poorly executed price increases with churn spikes of 15%+, with no link (https://www.getmonetizely.com/articles/price-increases-vs-retention-modeling-the-trade-off-for-saas-success) [unverified].
- [design] Spread: a well-tested price is often 20–50% above an untested one for the same product; the stellar operator captures that surplus and the average one leaves it. Use as a simulator assumption, not a sourced fact.

### Common mediocre-operator traps
- Pricing below cost of support and AI inference, then adding usage costs later with no warning.
- Discounting every enterprise deal to close. Trains buyers to wait.
- A free tier with no limit that eats the paid tier.
- Raising prices by surprise with no grandfathering. Churn follows the surprise, not the price.

### Detection
- Decision patterns: does the player set a price from the buyer's alternative and the value metric? Does the player test before launch?
- Follow-through: is there a pricing review date? Is the annual mix tracked?
- Text quality: whether the pricing page explains the value metric in one sentence.
- Cannot be gamed: whether the price matches the simulated buyer's willingness-to-pay distribution. A player who claims "tested" must show a sample or a cohort result.

### Feedback
- Price from cost: "Start from what the buyer pays today to solve this, then check your costs fit under that."
- Surprise increase: "Give 60 days' notice, grandfather existing customers for a period, and say why."
- Unlimited free: "Put the limit where the paying customer gets value, not where the free user gets it for free."
- Hidden self-serve price: "If a buyer cannot find the price in 10 seconds, they leave; show it."

### Sources
- ProfitWell annual vs monthly report (2019), via Paddle: https://paddle.com/studios/shows/profitwell-report/annual-vs-monthly [unverified for current use]
- Paddle retention metrics documentation: https://developer.paddle.com/concepts/retain/metrics
- Monetizely, price increases vs retention (May 2025): https://www.getmonetizely.com/articles/price-increases-vs-retention-modeling-the-trade-off-for-saas-success [unverified]
- Monetizely, price-churn sweet spot: https://www.getmonetizely.com/articles/the-price-churn-relationship-finding-the-sweet-spot [unverified]

---

## 6. Lifecycle email and activation

### Tier behaviours
- **Stellar:** Defines one activation event (the action that predicts retention, e.g., first project created, first integration connected) and measures time-to-activation weekly. Writes the onboarding sequence around that event, with 4–6 emails, each with one action. Triggers emails on behaviour (stalled at step 2) not on the clock. Runs a re-engagement sequence with a clear exit. Reads cohort activation monthly and changes the onboarding flow based on drop-off step, not email open rates.
- **Good:** A welcome sequence, a few behaviour triggers, tracks open and click. Knows the activation metric but reviews it quarterly.
- **Average:** Sends a generic newsletter to everyone. Welcome email plus a monthly update. Judges emails by open rate. No activation definition.
- **Mediocre:** Blasts the full list weekly with discounts. Sends "we miss you" to users who never activated. Uses "unsubscribe" as a churn metric and never reads the cohort data.

### Outcome spreads
- Onboarding email performance (PostHog, post on their own flow, n.d.): 56% open and 7.4% CTR on their onboarding flow, with their floors at 40% open and 4% CTR and goals at 50% and 6% (https://posthog.com/blog/how-we-built-email-onboarding) [unverified for generalisation; one company's own flow].
- Welcome emails: vendor guidance says open above 50% and click above 20%, with top performers at 30–40% clicks [unverified].
- Activation rate: a 2022 survey gives median activation of 25% overall and 30% for SaaS; a Userpilot-based roundup gives an average of 37.5% across 62 companies [unverified; definitions differ]. A 2026 "412,000-user" claim of 41.7% median is self-published and unverified; exclude it.
- Email benchmarks generally: a 2025 planning report gives 21.5% average open and 7.2% average click for SaaS [unverified; no methodology].
- [design] Spread: the gap that matters is activation, not open rate. A stellar operator moves activation by 10–20 points in a quarter through flow fixes; email tweaks alone rarely do this.

### Common mediocre-operator traps
- Optimising open rate. Subject-line testing that lifts opens but not activation.
- Emailing non-activated users with upsells.
- No activation metric, so every change is judged by feel.
- Sending the same drip to a trial user who signed up for a specific use case and a user who signed up by accident.

### Detection
- Decision patterns: does the player name the activation event and measure it? Does the player segment by signup intent?
- Follow-through: whether emails are triggered by behaviour and whether the player reads cohort data monthly.
- Text quality: emails with one action and a specific next step vs multi-link newsletters.
- Cannot be gamed: whether the simulator's activation numbers come from the modelled product flow. A player who claims a big activation lift without a changed flow step should be flagged.

### Feedback
- Open-rate focus: "Open rate tells you the subject line worked; activation tells you the product did. Judge by activation."
- Upsell to non-activated: "Get them to the first useful action; the upsell is for people who already got value."
- No activation metric: "Pick the one action that predicts a user staying, and measure it weekly."
- One drip for all: "Split signup by intent on the form and send different onboarding to each."

### Sources
- PostHog, how we built our email onboarding: https://posthog.com/blog/how-we-built-email-onboarding
- Folderly, SaaS email marketing report 2025: https://generate.folderly.com/saas-email-marketing-report-2025 [unverified]
- Sequenzy, SaaS email benchmarks: https://www.sequenzy.com/blog/saas-email-marketing-benchmarks [unverified]
- Activation rate figures (2022 survey and Userpilot-based roundup), seen only as secondary summaries in search results; primary URL not captured [unverified]
