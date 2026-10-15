# PLG levers: research for the founder simulator (as of 2026-10-15)

Conventions: [design] = my estimate, not a statistic. [unverified] = secondhand or vendor claim I could not trace to a primary publication. Most benchmarks below come from vendor-published roundups; treat any single number as a range, not a target. Definitions (opt-in vs opt-out, visitor-to-paid vs free-to-paid) differ across sources, so compare only within one source.

Key cross-cutting finding: the spread inside any one lever is far wider than the spread between levers. Trial conversion is bimodal, so the operator's job is to find the activation event and make the trial reach it.

---

## 1. Freemium vs free trial vs reverse trial vs opt-out trial

**What it is and fits.** Freemium = permanent free tier. Free trial = time-boxed full access, with or without a card. Reverse trial = full features free for a window, then downgrade to a free tier (no card). Opt-out trial = card collected up front, auto-converts to paid. Fits self-serve B2B SMB and B2C best. Enterprise uses sales-led trials, which are out of scope here.

**Sourced ranges.** A January 2026 table, reproduced by Userpilot from ChartMogul, Growth Unhinged and ProductLed data (50th / 75th percentile "good / great" free-to-paid):
- Freemium (standard) 3–5% / 8–12%
- Freemium (ungated, no account) 7–9% / 8–12%
- Free trial, no card 4–6% / 10–15%
- Reverse trial 4–6% / 8–12%
- Free trial, card required 25–35% / 50–60%
- B2B-focused products 6–10% / 15–20%; AI-native 6–8% / 15–20%
Source: https://userpilot.com/blog/free-trial-conversion-rate/ (secondary, [unverified] against the ChartMogul original; undated page, cites January 2026).

Growth Unhinged 2025 analysis of 200 B2B products (published 2026, via Userpilot): median trial conversion 8%; distribution bimodal, with 20% of products below 2.5% and 23% above 25%. Same source gives a "per 1,000 visitors" model: freemium 90 signups (about 5 payers), no-card trial 45 signups (3.6 payers), ungated freemium 70 (5.6 payers), card-required trial 35 (10.5 payers). The point: freemium wins on top-of-funnel volume, card trials win on conversion.

First Page Sage dataset (86 companies, Q1 2022–Q3 2025, reported via Userpilot, [unverified]): organic opt-in trial 18.2%, opt-out (card) trial 48.8%. Their numbers are far above the ChartMogul table, which suggests a different denominator. Do not mix them.

Mobile, B2C (RevenueCat State of Subscription Apps 2026, mostly 2025 data, https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026): hard-paywall apps median Day-35 conversion 10.7% vs 2.1% for freemium; revenue per install at day 60 $3.09 vs $0.38; year-one retention about equal (27% vs 28%). Trials of 17–32 days converted at 42.5% median vs 25.5% for trials under four days (Subscription Insider summary, https://www.subscriptioninsider.com/article-type/news/revenuecat-data-shows-subscription-app-growth-concentrating-at-the-top). Freemium's retention edge disappears once you control for cost per paying user.

**Setup and weekly work.** Pick the model from time-to-aha: if the core value shows up in under a day, a no-card trial or freemium works; if it takes 1–3 weeks of setup, use a longer trial and card collection. Build: trial in billing (Stripe trial or equivalent), an activation event, day 1/3/7/12 lifecycle emails, and an expiry banner. Setup 20–40 h [design]. Weekly: 3–4 h reviewing the funnel by cohort [design].

**Stellar / good / average / mediocre.**
- Stellar: defines activation from retained users, sets trial length to reach it with margin, sends an "aha not yet reached" email with a specific next step, runs one card-vs-no-card test with at least 300 starts per arm [design].
- Good: copies a competitor's model, has an activation event, measures it weekly.
- Average: freemium because "it's the standard," no activation definition, conversion read off total signups.
- Mediocre: forever-free tier that includes the paid feature, or a 3-day card trial with no reminders.
- Outcome gap [design]: between an unactivated and activated cohort, conversion commonly differs by an order of magnitude (2–8% vs 35–65% in one vendor's data, [unverified]).

**Mistakes and consequences.** Card-required trials without a pre-charge reminder produce chargebacks, refund demands and complaints; budget 5–10% of first-charge revenue in refunds and disputes [design]. Auto-renewal without clear disclosure and easy cancellation creates exposure under state automatic-renewal laws (e.g. California) and EU consumer rules; verify current status with counsel. Reverse trial downgrades that delete the user's data cause churn and support tickets. Freemium with unbounded inference or hosting cost burns margin with no conversion, especially for AI features [design].

**Sources.** Userpilot free-trial page (https://userpilot.com/blog/free-trial-conversion-rate/, undated, cites Jan 2026); RevenueCat 2026 report (https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026, 2026, 2025 data); Subscription Insider summary (https://www.subscriptioninsider.com/article-type/news/revenuecat-data-shows-subscription-app-growth-concentrating-at-the-top, 2026).

---

## 2. Usage limits, paywalls and in-app upgrade prompts

**What it is and fits.** Gating a meter (seats, records, runs, AI credits) or a feature behind a plan, and prompting upgrade at placement points. Fits every PLG model; the value metric matters most for usage-priced AI products.

**Sourced evidence (thin).**
- RevenueCat case (23 Nov 2023, https://www.revenuecat.com/blog/growth/paywall-placement.md): a plant-care app moved its paywall from a usage trigger (sixth plant added) into onboarding and switched to feature-based pricing. Sign-up-to-trial rose from 3% to 15%. This is confounded: the pricing change happened at the same time, so the placement effect alone is unknown. A mental-wellness app reported 5x revenue after moving the paywall earlier, with no baseline given.
- The same article lists placements RevenueCat's own guidance favors: before onboarding, after onboarding, before a locked feature, and after a core feature. Its "usual winning combination" is on every app open, before any locked feature, and both before and after onboarding. This is practitioner opinion, not an experiment.
- RevenueCat 2026 (2025 data): hard paywalls outperform freemium on early conversion (see Lever 1). This is a placement-plus-model result, not a usage-limit result.
- A DEV Community post claims contextual, capability-based paywalls reach about 12% median conversion vs 2% for freemium, attributed to RevenueCat 2025 [unverified; I could not find the report].
- A "+234%" placement uplift from a paywall vendor has no methodology. Ignore it.
- I found no independent lift figure for usage-limit prompts specifically. Say so when quoting.

**Setup and weekly work.** Define the meter that tracks value (not a proxy for cost). Set the limit so the typical active user hits it in weeks 2–4 [design]. Instrument: limit-hit event, prompt shown, click, checkout, and a "why not" survey for dismissals. Build time 20–40 h [design]. Weekly 2 h to read limit-hit cohorts and test one prompt copy change.

**Stellar / good / average / mediocre.**
- Stellar: prompts after a success moment, shows exactly what the next tier unlocks, offers a smaller step (credit pack, annual switch), warns at 75% and 100% of limit, and never blocks saved work. Runs a holdout of 10–20% to measure lift [design].
- Good: limit-hit prompt with a clear unlock list; tests two copy variants.
- Average: prompts on every login; limit blocks the whole product.
- Mediocre: countdown timers and stacked promos on out-of-credit screens, or a hard block on export or data access.
- Outcome gap [design]: a holdout-measured lift of 10–25% on upgrade conversion for good vs average prompts; a 3–8% increase in 90-day churn for mediocre hard blocks.

**Mistakes and consequences.** Blocking data export at the limit creates lock-in complaints, regulatory exposure under data-portability rules (GDPR Art. 20 covers provided data [design]), and churn. Countdown dark patterns get reported and invite consumer-protection action (EU and US) [unverified specifics]. Prompts that ask for money before value is delivered show up as one-star reviews (see support lever in other notes).

**Sources.** RevenueCat paywall placement (https://www.revenuecat.com/blog/growth/paywall-placement.md, 2023-11-20); RevenueCat 2026 report (https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026); DEV Community post (https://dev.to/paywallpro/why-top-ai-apps-convert-at-12-while-most-struggle-at-2-7j, [unverified]).

---

## 3. Product-qualified leads (PQLs) and handoff to sales

**What it is and fits.** A PQL is a free or trial account whose product behaviour shows buying intent (team invites, usage near a limit, a company domain, several seats active). It is handed to a rep. Fits B2B PLG with ACV of roughly $1k and up; below that, handing to sales rarely pays.

**Sourced ranges.**
- Gainsight Product-Led Growth Index 2022 (https://www.gainsight.com/resource/benchmark-product-qualified-lead-pql-conversion-rates/): trials using PQLs convert 2.8x higher than those that don't. Sample not stated, and the median table sits behind a form.
- ProductLed survey of 600+ B2B SaaS companies, undated (reported via Userpilot): PQL-driven conversion about 25%, 30–39% for $1k–$5k ACV; average free-to-paid across models 9%; 24% of companies use PQLs.
- Agency claim [unverified]: median PQL-to-paid 32%, top quartile 45%+, bottom quartile under 18%; MQL-to-SQL median 19%.
- Vendor claims [unverified]: SAL-to-SQL 47%; PQL-to-MQL ratio 1.6–2.4x. I found no independent sales-acceptance benchmark.

**Setup and weekly work.** Define the PQL rule from your activation data, not from a generic list. Route: company-domain signups and high-intent events to a queue; SLA of same-day (under 24 h) for high-intent accounts [design]. Tools: a product analytics feed into a CRM. Build 15–30 h [design]. Weekly: 2–3 h reviewing PQL quality with the rep, and a monthly rule update.

**Stellar / good / average / mediocre.**
- Stellar: PQL rule validated by checking which accounts later closed; rep gets account context (what they did, which limits they hit); the first touch is a useful offer, not a pitch; disqualified PQLs go back to self-serve with a note.
- Good: rule from activation data, rep gets basic usage summary, 1–2 day SLA.
- Average: any signup from a company domain goes to sales; reps spend time on students and hobbyists.
- Mediocre: every free user is emailed by sales within an hour, which feels like surveillance.
- Outcome gap [design]: rule quality separates a PQL-to-close rate of around 5–8% from 15–25%, roughly the same 2–3x gap the Gainsight index reports.

**Mistakes and consequences.** Contacting users based on their product data without a clear privacy notice creates GDPR transparency and lawful-basis issues; in the UK, PECR's corporate-subscriber exemption permits B2B email but not UK GDPR duties (see Lever 4 sources). Rep time burned on bad PQLs (cost ~ rep hours × pipeline noise [design]). Sales emailing free users who never asked to talk generates spam complaints that hit the domain's reputation.

**Sources.** Gainsight PLG Index 2022 (https://www.gainsight.com/resource/benchmark-product-qualified-lead-pql-conversion-rates/); Userpilot free-trial page for ProductLed survey (https://userpilot.com/blog/free-trial-conversion-rate/); agency and vendor pages [unverified]: https://web.howdygo.com/blog/product-qualified-leads, https://prospeo.io/s/product-qualified-lead.

---

## 4. Viral loops: invites, collaboration, sharing, "Powered by" badges

**What it is and fits.** Users bring in other users via invites, shared outputs, public pages or badges. Strongest where the product is multi-user or output-sharing (docs, booking pages, designs, reports). Weak for single-user tools.

**Sourced ranges (mostly vendor, [unverified]).**
- K-factor = invites per user × invite conversion rate. Vendor calculators: typical SaaS 0.15–0.25; good referral programs 0.5–0.7; strong viral products 1.0–1.5 (rare). Another source: >0.2 is good for B2B; 0.3–0.7 strong. Sources: https://www.saxifrage.xyz/post/k-factor-benchmarks, https://userjot.com/tools/viral-coefficient-calculator.
- Cycle time: one secondhand citation of a company with K 0.2 and an 8-month cycle time (Echosign, via the Saxifrage post). No benchmark for collaboration tools' cycle time found.
- Badges: a Calendly-style "Powered by" badge is the best-known case, but I found no measured conversion lift. A Loom watermark claim of 30% of organic signups is unverified.
- Dropbox referral (case summary, 2008–2010 program era, secondary, [unverified]): both sides got 500 MB, capped at 16 GB; signups grew from ~100k to ~4M over 15 months; referrals peaked at ~35% of signups; per-paying-customer paid search cost $233–388 at the time. Primary company data would be needed to confirm.
- Collaboration products plausibly sit above typical K-factors, but I found no measured data.

**Setup and weekly work.** Put the invite where collaboration is needed (the moment a second person is required), not in settings. Add a share or badge on outputs with a tracked link, and measure invites sent per active user and accepted-invite rate weekly. Build 15–30 h [design]. Weekly 2 h.

**Stellar / good / average / mediocre.**
- Stellar: invite is part of the core flow, cycle time measured and shortened (e.g., the invitee gets value in the first session), the badge is subtle and branded, and invites are opt-in per recipient.
- Good: invite at a collaboration moment, measured weekly.
- Average: an "invite friends" button in settings, reported as "referrals" in the dashboard.
- Mediocre: import all contacts and send invites automatically.
- Outcome gap [design]: K of 0.2 vs 0.5 is a 2.5x difference in viral signups, which compounds across cycles: at a 30-day cycle, growth from viral alone can differ by several times over a year.

**Mistakes and consequences.** Contact-import invite spam is the classic failure. The Path social network settled an FTC matter in 2013 over collecting contacts and sending messages without consent (about $800k) [unverified, check FTC record]. Under CAN-SPAM, commercial invite email needs a valid physical address and opt-out; the UK PECR regime applies a consent rule to individuals' email, so consumer invites need consent. Referral fraud (fake accounts farming rewards) costs reward budget and cleanup [design]. Badges on client-facing output damage agency and B2B credibility.

**Sources.** Saxifrage K-factor (https://www.saxifrage.xyz/post/k-factor-benchmarks); Userjot calculator (https://userjot.com/tools/viral-coefficient-calculator); Dropbox case summary (https://app.getlaunchlist.com/blog/dropbox-referral-program-case-study, [unverified]); FTC 2013 Path matter (search: "FTC Path 2013 settlement", [unverified]).

---

## 5. Template galleries, community templates and programmatic SEO from product data

**What it is and fits.** Hand-made starter templates (gallery), user-submitted templates (community), and pages generated from structured product data (programmatic SEO, pSEO). Fits horizontal tools with a common use case (forms, boards, invoices, booking, calculators) and data-rich products (directories, benchmark data).

**Sourced evidence (weak).** Zapier, Wise and Canva traffic figures conflict by a factor of 2–10 across teardowns (for example, Canva ~21,000 template pages and ~13M monthly organic visits in one teardown; Wise 14,888 currency pages and 4.6M visits in another). These are third-party estimates [unverified]. I found no source with template-to-paid conversion for any gallery. I could not verify quoted Google guidance, so check Google Search Central's spam policies directly, especially the "scaled content abuse" section.

**Setup and weekly work.** Gallery first: 20–50 hand-made templates that show real use cases, each with a clear "use this" path into signup. Scale to pSEO only once templates are performing and each page has unique data from the product (aggregated, anonymised usage, live pricing, benchmark tables). Build: gallery 20–40 h; pSEO 40–80 h [design]. Ongoing: 4–6 h a week moderating community templates and refreshing data [design].

**Stellar / good / average / mediocre.**
- Stellar: each page answers a real query with data no other site has; pages are pruned when they get no impressions after 90 days; community templates reviewed before publish; use-case pages link to the product's own tools.
- Good: 30 hand-made templates with a clear signup path; measures template-started and template-converted separately.
- Average: 2,000 near-duplicate pages with swapped city names.
- Mediocre: templates that auto-publish user content with no review, including phishing or malware templates.
- Outcome gap [design]: a curated set with unique data often outperforms a large set of thin pages; expect a few percent of pages to produce most traffic.

**Mistakes and consequences.** Thin pSEO gets demoted or deindexed, and the cleanup means losing the whole domain's traffic for months [design]. Community templates can carry copyright or trademark claims that require takedowns. Publishing aggregated user data needs anonymisation and a privacy notice, or it becomes a GDPR incident. Templates that handle personal data inherit your obligations.

**Sources.** Teardowns with traffic claims, all [unverified]: https://www.omnius.so/blog/best-programmatic-seo-examples, https://discoveredlabs.com/blog/programmatic-seo-examples-10-real-world-templates-that-drive-organic-growth. Google Search Central spam policies (verify directly).

---

## 6. Free tools and calculators as acquisition

**What it is and fits.** A free, useful tool (grader, calculator, generator) that captures an email or prompts signup. Fits B2B and B2C where a quick answer is worth a form. Works best when the answer uses proprietary data.

**Sourced evidence.** I found no quantified benchmark for free-tool lead volume or conversion. The HubSpot Website Grader is described as one of its most successful lead tools, but only in agency and partner accounts; one partner reported a single closed-won deal within 30 days [unverified, anecdote]. Sources: https://www.hubspot.com/solutions-partner-resource-center/website-grader-widget. [design] planning range: calculator visit to signup 2–8%, depending on whether the result is gated.

**Setup and weekly work.** Build one tool that answers a question your buyer already searches for, using anonymised product data where possible (ties to Lever 5). Gate only the detailed report, not the result. Build 20–40 h [design]. Weekly 2 h for SEO and results review.

**Stellar / good / average / mediocre.**
- Stellar: the tool gives a specific answer, shows its method and assumptions, and offers a next step matched to the result; it is tested for math errors before launch.
- Good: clear answer, gated detail, follow-up email with opt-in.
- Average: generic calculator with no data behind it; email captured by default.
- Mediocre: wrong formulas, or a financial or tax calculator with no disclaimer.
- Outcome gap [design]: a calculator with proprietary data and a clear method typically earns 2–3x more repeat traffic than a generic one.

**Mistakes and consequences.** Wrong math in a finance or tax tool produces customer losses, public corrections and possible liability; add disclaimers and a review step [design]. Capturing emails without opt-in makes every later send a PECR/GDPR problem for consumers (corporate contacts are treated differently in the UK, see Lever 4). Gating too early kills the traffic that SEO depends on.

**Sources.** HubSpot partner resource page (https://www.hubspot.com/solutions-partner-resource-center/website-grader-widget, [unverified]); InboundLabs case page (secondary, [unverified]).

---

## 7. Self-serve onboarding: checklists, empty states, time-to-value

**What it is and fits.** The sequence from signup to the first real outcome: checklist, guided setup, sample data, empty-state prompts. Fits every PLG model, and is the main lever for trial conversion (Lever 1).

**Sourced ranges.**
- Userpilot 2025 SaaS benchmark report (https://userpilot.com/blog/saas-benchmarks-report/, 2025, vendor's own customer base): average onboarding checklist completion 19.2% (188 companies); B2B SaaS median 10.1%; by vertical FinTech/Insurance 24.5%, Healthcare 20.5%, EdTech 15.9%, AI/ML 14.7%, CRM/Sales 13.2%.
- Same report: average activation rate 37.5% (62 companies); average time-to-value about 1 day 12 hours.
- Amplitude 2025 Product Benchmark Report (2,600+ companies, Sept 2023–Sept 2024, https://amplitude.com/benchmarks): top-quartile activation users are also top-quartile retainers. Use their percentile tables for your vertical; the snippets did not expose the activation values.
- Welcome email open rates above 50% (Sequenzy, vendor, [unverified]). Apple Mail Privacy Protection inflates opens (see Lever 10).

**Setup and weekly work.** Define one activation event (the first outcome, not a login). Checklist of 3–5 steps; empty states that show sample data and one next action; a sample project created on signup. Build 30–60 h [design]. Weekly 2 h to read the step-drop funnel and fix the worst step.

**Stellar / good / average / mediocre.**
- Stellar: time-to-value measured in minutes, not days; sample data is realistic and removable; every drop-off step has a fix in the next release; the checklist shrinks as steps are automated.
- Good: 4-step checklist, sample data, activation event measured weekly.
- Average: checklist of 8 tasks, tours on every page, generic empty states.
- Mediocre: forced product tour before any value, empty dashboards with no next step.
- Outcome gap [design]: moving checklist completion from the 10% B2B median to 25–30% is the kind of gap that separates good from average teams.

**Mistakes and consequences.** Long checklists lower completion (each extra step loses users). Over-emailing onboarding triggers unsubscribes and spam complaints. Skipping sample data costs the trial: the user leaves before seeing the aha. Each dead day in a trial is revenue lost in the first 30 days [design].

**Sources.** Userpilot benchmark report (https://userpilot.com/blog/saas-benchmarks-report/, 2025); Amplitude benchmarks (https://amplitude.com/benchmarks); Sequenzy (vendor, [unverified]).

---

## 8. Expansion inside accounts: seats, usage-based expansion, in-product upsell

**What it is and fits.** Revenue growth from existing customers: more seats, more usage, a higher tier. Fits seat-based B2B, usage-based and AI products, and hybrid models.

**Sourced ranges.**
- Benchmarkit 2026 (FY2025 data, summarised by Orb, https://www.withorb.com/blog/net-revenue-retention-statistics): median B2B SaaS NRR 102%; usage-based 108% vs seat-based 98%.
- Benchmarkit 2025 (same source): hybrid 110%, usage 101%, subscription 101% median NRR; GRR usage 92% vs subscription and hybrid 88%.
- High Alpha 2025 (same source): hybrid 105%, subscription 102%, outcome-based 100%, consumption 99%. This contradicts the Benchmarkit ranking, so treat the pricing-model ranking as unsettled.
- Optifai 2026 (cites a top-quartile table of 939 companies, [unverified]): enterprise 118%, mid-market 108%, SMB 97%.
- Expansion share of new ARR rose to around 40% in Benchmarkit's 2024 data [unverified secondary].
- Growth Unhinged 2025 SaaS Benchmarks (Nov 2025, 800+ companies, mainly $5–20M ARR, https://kylepoyar.substack.com/p/2025-saas-benchmarks-report): top-quartile growth for sub-$1M ARR companies 300% year on year.

**Setup and weekly work.** Expansion triggers: seat limit hit, a teammate invited, usage crossing a threshold, a feature used that a higher tier includes. The upgrade screen shows the ROI in the customer's own terms. Build 20–40 h [design]. Weekly 2 h to review expansion cohorts and failed upgrades.

**Stellar / good / average / mediocre.**
- Stellar: pricing scales with the value metric so expansion follows success; reps get an alert on expansion signals; annual upgrades get a prorated credit; a downgrade is one click (keeps trust).
- Good: seat expansion triggered by invites; usage shown in the billing screen before a bill arrives.
- Average: upsell modal on every page; overage billed without warning.
- Mediocre: punishing seat-count increases, surprise overages, or a cancel flow that hides the downgrade.
- Outcome gap [design]: NRR of about 98% (average) vs 110%+ (good) is a 12-point difference, compounding to roughly 20–30% more revenue after three years on a constant new-logo base.

**Mistakes and consequences.** Surprise usage bills cause chargebacks, churn and regulatory complaints; some US states and the EU have rules on unexpected charges [verify]. Seat-count penalties push teams to share logins, which is a security and licence risk. Upsell during a failing workflow creates the churn it was meant to prevent.

**Sources.** Orb summary of Benchmarkit and High Alpha (https://www.withorb.com/blog/net-revenue-retention-statistics, 2025–2026); Growth Unhinged 2025 SaaS benchmarks (https://kylepoyar.substack.com/p/2025-saas-benchmarks-report); Optifai (secondary, [unverified]).

---

## 9. In-product referral prompts

**What it is and fits.** Asking a satisfied user to refer others, with a reward, at a success moment. Fits PLG tools where the referee also benefits from the product. Pairs with Lever 4.

**Sourced ranges.**
- GrowSurf (vendor): 10–15% of active SaaS users participate in referral programs; prompts after an aha moment show about 60% higher participation, attributed to Gainsight [unverified, not checked against Gainsight].
- Referral-program vendor reference [unverified]: awareness above 40% of active users; active referrers 5–15%; share rate 20–40% of those who see the prompt; referred-user conversion 15–25% vs 5–10% for organic.
- Dropbox (see Lever 4): two-sided reward, 500 MB each, referrals a large share of signups in its growth period [unverified].
- ReferralCandy average figure: not found.

**Setup and weekly work.** Trigger after a success event; reward both sides (or reward the referrer with a feature, not cash, when cost matters); one-click share link; referral tracked by unique code. Build 10–20 h [design]. Monthly 1 h to check rewards and fraud.

**Stellar / good / average / mediocre.**
- Stellar: prompt only after a delivered outcome; reward costs modelled per referred paying customer; fraud checks on same-device or same-card referrals; referred users get an onboarding path tailored to the referral.
- Good: after activation, two-sided reward, tracked codes.
- Average: prompt on every login; reward in cash.
- Mediocre: prompt during an outage or failed action; referral emails sent from the user's contact list without consent.
- Outcome gap [design]: targeting the prompt to post-aha users moves participation from roughly 5% to 10–15% of actives, depending on the program.

**Mistakes and consequences.** Reward fraud cost and cleanup time. Referral emails sent from the user's contacts breach CAN-SPAM for commercial email and PECR-style consent rules for consumers (see Lever 4). Cash rewards can have tax reporting obligations depending on jurisdiction [verify with an accountant].

**Sources.** GrowSurf SaaS referral statistics (https://growsurf.com/statistics/saas-referral-statistics/, undated, [unverified]); Prefinery (https://www.prefinery.com/blog/referral-marketing-builds-saas-communities/, [unverified]).

---

## 10. PLG metrics: activation, PQL rate, free-to-paid, natural rate of growth

**What it is and fits.** A small set of metrics that tells you whether the PLG engine works. Use all of them for PLG-led products; for sales-led, only the free-to-paid and PQL-rate parts apply.

**Definitions and sourced ranges.**
- Activation rate: share of signups that reach the activation event. Userpilot 2025: average 37.5% (62 companies) [unverified, vendor base]. Amplitude 2025 percentile tables by vertical are the better reference.
- PQL rate: share of free accounts that cross the PQL rule. No independent benchmark found; PQL-to-paid ranges are in Lever 3.
- Free-to-paid: 3–8% for freemium, 4–15% for free and reverse trials, 25–60% for card-required trials (Lever 1).
- Natural rate of growth (NRG), an OpenView concept: the share of growth from PLG channels (word of mouth, SEO, product-led referral) rather than sales or paid. Secondary sources cite a "good" range of 50–150% depending on ARR scale, with 100%+ at $1–10M ARR [unverified; check the OpenView article at https://openviewpartners.com/blog/time-to-refine-your-metrics-defining-growth-and-success-at-a-plg-company].
- Growth Unhinged 2025 benchmarks (Nov 2025, 800+ companies): the efficient growth matrix shows 13% of respondents with high NRR and low CAC payback, 15% with high NRR and high payback, 15% with low NRR and low payback, 12% with low NRR and high payback. Top-quartile growth under $1M ARR: 300% YoY.
- Email deliverability as a PLG metric: Google bulk-sender rules apply above 5,000 messages a day to Gmail (effective 1 Feb 2024). Keep spam-complaint rate in Postmaster Tools below 0.30% (the hard threshold); Google advises keeping it below 0.10%. Authentication (SPF, DKIM, DMARC) and one-click unsubscribe are required. Source: https://support.google.com/a/answer/81126 (fetched). Yahoo's ceiling is similar at 0.30% [unverified].
- Open rates are unreliable: Apple Mail Privacy Protection loads pixels automatically. beehiiv's 2025 network average was 41.24% (vendor), MailerLite reports 43.46%, and one analysis puts true opens closer to 25% [unverified]. Use clicks or replies.

**Setup and weekly work.** One dashboard with activation, PQL rate, free-to-paid by cohort, NRG, K-factor, and Postmaster spam rate. Definitions written once. Build 10–20 h [design]. Weekly 2–3 h.

**Stellar / good / average / mediocre.**
- Stellar: cohort-based, uses holdouts for lift, reviews NRG and K monthly, and sets a spam-rate alarm at 0.08% (below Google's advice).
- Good: cohort activation and free-to-paid weekly; email spam rate checked.
- Average: total signups and open rates as headline metrics.
- Mediocre: vanity metrics; no spam monitoring until the domain is rejected.
- Outcome gap [design]: a spam-complaint rate that climbs past 0.30% can move Gmail from inbox to rejection (550-series errors), turning every lifecycle email into lost revenue until the domain recovers, which can take weeks.

**Mistakes and consequences.** Reading opens as engagement leads to bad decisions. Ignoring the Postmaster spam rate leads to rate-limiting and rejections, which hit onboarding and trial conversion directly (Lever 7). Sending without one-click unsubscribe fails bulk requirements.

**Sources.** Google Postmaster and bulk sender rules (https://support.google.com/a/answer/81126, fetched 2026-10-15); Userpilot benchmark report (https://userpilot.com/blog/saas-benchmarks-report/); Growth Unhinged 2025 benchmarks (https://kylepoyar.substack.com/p/2025-saas-benchmarks-report); OpenView NRG article (https://openviewpartners.com/blog/time-to-refine-your-metrics-defining-growth-and-success-at-a-plg-company, [unverified]).

---

## Sources (consolidated)

- Userpilot free-trial conversion (ChartMogul / Growth Unhinged / ProductLed table, Jan 2026): https://userpilot.com/blog/free-trial-conversion-rate/
- Userpilot 2025 SaaS benchmark report: https://userpilot.com/blog/saas-benchmarks-report/
- RevenueCat paywall placement (2023-11-20): https://www.revenuecat.com/blog/growth/paywall-placement.md
- RevenueCat State of Subscription Apps 2026: https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026
- Subscription Insider summary of RevenueCat 2026: https://www.subscriptioninsider.com/article-type/news/revenuecat-data-shows-subscription-app-growth-concentrating-at-the-top
- Gainsight PLG Index 2022 (PQL): https://www.gainsight.com/resource/benchmark-product-qualified-lead-pql-conversion-rates/
- Growth Unhinged 2025 SaaS Benchmarks (2025-11-12): https://kylepoyar.substack.com/p/2025-saas-benchmarks-report
- Orb summary of Benchmarkit / High Alpha NRR (2025–2026): https://www.withorb.com/blog/net-revenue-retention-statistics
- Google bulk sender requirements (fetched): https://support.google.com/a/answer/81126
- Amplitude benchmarks: https://amplitude.com/benchmarks
- Saxifrage K-factor benchmarks: https://www.saxifrage.xyz/post/k-factor-benchmarks
- Dropbox referral case summary [unverified]: https://app.getlaunchlist.com/blog/dropbox-referral-program-case-study
- OpenView NRG article: https://openviewpartners.com/blog/time-to-refine-your-metrics-defining-growth-and-success-at-a-plg-company
- GrowSurf referral statistics [unverified]: https://growsurf.com/statistics/saas-referral-statistics/
- HubSpot Website Grader partner page [unverified]: https://www.hubspot.com/solutions-partner-resource-center/website-grader-widget

Gaps to close before the simulator relies on any number: (a) the primary ChartMogul and Growth Unhinged trial tables (Lever 1), (b) an independent usage-limit paywall experiment (Lever 2), (c) a sourced sales-acceptance rate for PQLs (Lever 3), (d) measured K-factor data for collaboration tools (Lever 4), (e) template and calculator conversion data (Levers 5–6), (f) the FTC and Yahoo primary pages (Levers 4, 10), and (g) UK PECR and the 2025 Data (Use and Access) Act status on the ICO site (Levers 3–4).
