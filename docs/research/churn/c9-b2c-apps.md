# C9: Churn, trial drop-off, cancellation, refunds and win-back for B2C consumer subscription apps

Research date: 2026-10-14. Adapted from the B2B segment brief in BRIEF.md.

## How to read this file

- **Primary-source coverage is thin at category level.** RevenueCat's full State of Subscription Apps 2025 and 2026 reports publish per-category breakouts in a gated PDF. The public write-ups I could read (dated below) give cross-category medians plus a few AI-app and shopping-app splits. Apphud has no public category benchmark I could find. Adapty's 2025 report was reachable only through summaries.
- **Tags.** [design] means my estimate, anchored to the nearest sourced figure. [unverified] means a figure from a secondary blog, a vendor page, or a search summary I could not confirm against the original. Untagged numbers are from a cited URL, with the date given.
- **Reason-mix tables are estimates.** No public source gives a cancellation-reason split for each of the nine categories. Every table is [design], calibrated to the cross-category anchors in section 0. Shares sum to about 100%.
- **Source conflicts.** Summaries disagree on the AI-app churn gap (30% vs 36% faster; both attributed to RevenueCat 2026). They also disagree on the RevenueCat sample size (75k, 115k, and "over 115k"). The figures used below are the ones stated in the most direct source.

## 0. Cross-category anchors (used to calibrate every table)

| Metric | Value | Source |
|---|---|---|
| Share of annual subscribers who cancel in Year 1 | about 72% in 2026, up from about 56% in 2025 | RevenueCat, "The State of Subscription Apps in 10 minutes", 2026-03-19, updated 2026-04-22. https://www-docs.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026 |
| Share of annual cancellations in Month 1 | 35% | same |
| Share of 3-day-trial cancellations on Day 0 | 55.4% (about 51% in 2025) | same |
| Involuntary billing failures, share of cancellations | Google Play 31% (28.2% in 2025); App Store 14% (15.1% in 2025) | same |
| Trial-to-paid, trials of 17–32 days | 42.5% median | same |
| Trial-to-paid, trials under 4 days | 25.5% median | same |
| Day-35 trial-to-paid, hard paywall vs freemium | 10.7% vs 2.1% median | same |
| Yearly subscribers retained after 1 year | 28% freemium, 27% hard paywall | same |
| Reactivation of cancelled annual subscribers | about 4.9–5.9% (within one year); 95% of cancelled annual subscribers never return | RevenueCat 2026 part two, as summarized by PPC Land (https://ppc.land/95-of-annual-app-subscribers-who-cancel-never-return-revenuecat-finds/); date not stated |
| Reactivation of monthly subscribers, same price tier | about 28.9% | same |
| AI-app churn | AI apps churn about 30–36% faster than non-AI apps; 12-month retention 21.1% (AI) vs 30.7% (non-AI) | TechCrunch, 2026-03-10, https://techcrunch.com/2026/03/10/ai-powered-apps-struggle-with-long-term-retention-new-report-shows ; Computing, 2026, https://www.computing.co.uk/news/2026/ai-powered-apps-struggle-retain-subscribers |
| Cancellation reasons, 2025 RevenueCat (secondary) | not enough usage 37%; cost 35%; better alternative 10%; technical 7%; billing errors up to 28% on Google Play | RevenueCat blog, https://www.revenuecat.com/blog/growth/subscription-app-churn-reasons-how-to-fix.md [unverified as a summary] |
| Cancellation reasons, cross-SaaS (Churnkey, ~3M cancel sessions) | budget 33%; infrequent use 31%; other 17.9%; expectations not met 8.6%; technical 4.7%; alternative solution 4.3% | Churnkey State of Retention 2025, https://churnkey.co/guides/reduce-subscription-churn/_payload.json [unverified, read from embedded page data] |
| Overall monthly churn, Churnkey 2024 data | about 10% (voluntary about 7%, involuntary about 1%) | Churnkey, same [unverified] |
| Refund rate, all apps | median 2.71%; annual subscriptions 6–7.6% | Adapty refund guide, https://uploads.adapty.io/the_guide_on_managing_refunds_for_subscription_apps.pdf (undated) |
| Apple subscription refund process | Apple extended refund-contest to subscriptions in April 2024; developers have a short window (Adapty cites 12 hours) | Adapty, https://adapty.io/blog/refunds-guide (undated) [unverified] |

**Reading the anchors.** Cost and low usage together make up most cancellations in the vendor data. These are also the two reasons most likely to overlap: a user who never reached value often says "too expensive". Churnkey makes the same point about "budget" answers hiding product or value problems. The reason mix in every table below should therefore be read as a stated reason, not a root cause.

---

## 1. Health and fitness

**Churn level.** No public monthly or annual category figure was found. [design] Monthly churn about 9–12% of active subscribers; annual-plan Year-1 cancellation near the all-app 72%. Involuntary share about 15–25% of cancellations, with Google Play running higher than the App Store per the all-app split.

**Trial-to-paid drop-off.** Trial usage is high. A 2024 analysis (Gigazine) put the H&F median trial usage at 6.7% of installs, behind only Business at 6.9%, against 2.9% for games. [unverified, https://gigazine.net/gsc_news/en/20240313-apps-subscription-stats] Secondary write-ups cite H&F trial-to-paid medians of about 35–40% [unverified]. Drop-off is concentrated in the first 3 days. The main drivers are a workout or meal plan that doesn't fit the user's schedule, a paywall shown before the user has seen the content, and a free-tier that gives enough to stop there.

**Cancellation reason mix [design].**

| Reason id | Share |
|---|---|
| not_using (low usage after novelty) | 36% |
| price_too_high | 22% |
| achieved_goal | 8% |
| found_free_alternative (free routines, YouTube, Apple Fitness) | 9% |
| technical_issues (sync with watch/HealthKit, crashes) | 4% |
| subscription_fatigue (many subs) | 5% |
| payment_failed (involuntary) | 10% |
| forgot_renewal / surprised by renewal | 4% |
| seasonal (January spike then drop; summer) | 2% |
| **Total** | **100%** |

**Refunds and chargebacks.** Annual plans carry the highest refund rates [Adapty, see anchors]. Fitness apps see refund requests after the first charge on annual plans, typically within days. [design] Chargebacks are rare on app stores. Refunds on the store side are handled by Apple and Google, so the developer's exposure is mostly lost revenue, not chargeback fees.

**Win-back.** Monthly H&F subscribers return more often than annual ones (see anchors). [design] Expect about 10–20% of lapsed monthly users to resubscribe within 6 months with a seasonal or goal-based offer (January, pre-event). Annual reactivation is in the low single digits.

---

## 2. Productivity

**Churn level.** [design] Monthly churn about 7–10%. Productivity apps are often used in bursts. Annual plans churn hard in Year 1 for the reasons in section 0. Involuntary share roughly 15–20%, since card-on-file subscriptions dominate.

**Trial-to-paid drop-off.** [design] Trials of 7 days or longer convert better than 3-day trials, consistent with RevenueCat's 17–32 day finding. The big drop comes when the user has not created a second "real" item (a second task list, a second note, a second calendar sync). Setup friction and a "blank canvas" first session are the common causes.

**Cancellation reason mix [design].**

| Reason id | Share |
|---|---|
| not_using (dropped the habit; switched to notes or paper) | 30% |
| found_free_alternative (Apple Reminders, Notion free, Google Keep) | 16% |
| price_too_high | 14% |
| achieved_goal (project finished, course done) | 4% |
| technical_issues (sync conflicts, widget bugs) | 6% |
| subscription_fatigue | 7% |
| payment_failed (involuntary) | 12% |
| forgot_renewal | 6% |
| seasonal (students: exam periods, semester end) | 3% |
| other | 2% |
| **Total** | **100%** |

**Refunds and chargebacks.** [design] Refund requests cluster at the first annual renewal, often after the user says they never opened the app after month one. Chargebacks are more common on web-billed products (Stripe), where "I don't recognize this charge" is the usual reason.

**Win-back.** [design] Lapsed productivity users come back when a feature ships or when a new device arrives. Expect 5–10% reactivation within six months. No source found.

---

## 3. Education and language learning

**Churn level.** Duolingo reports a Western-market churn of about 28% in late 2025, down from 47% in 2020, as stated in a secondary Substack summary of its FY2025 figures [unverified, https://sergeycyw.substack.com/p/duolingo-q1-2025-earnings-analysis]. Duolingo's paid base was reported at 12.2M in the same summary. Babbel and smaller apps: no public churn figure found. [design] Monthly churn 8–12% for smaller language apps; annual plans churn heavily in Year 1 per the all-app 72%.

**Trial-to-paid drop-off.** A Business of Apps piece notes that language-learning retention is below several other categories [https://www.businessofapps.com/?p=56781, undated, unverified]. A secondary blog says language apps sit at the low end of iOS free-to-paid conversion, around 2–5% [unverified; I could not confirm it against RevenueCat]. The main drop-off is streak loss after 2–3 weeks and a "lesson fatigue" wall around the first plateau.

**Cancellation reason mix [design].**

| Reason id | Share |
|---|---|
| achieved_goal (trip done, test passed, course finished) | 14% |
| not_using (streak broke, lapsed) | 28% |
| price_too_high (versus free tier) | 14% |
| found_free_alternative (free tier of the same app, free courses, tutors) | 12% |
| subscription_fatigue | 6% |
| technical_issues | 3% |
| payment_failed (involuntary) | 12% |
| forgot_renewal | 5% |
| seasonal (exam periods, travel season) | 4% |
| other | 2% |
| **Total** | **100%** |

**Refunds and chargebacks.** [design] Refunds are rare, and most are on annual plans bought during a trip or course push. Chargebacks are rare on store billing.

**Win-back.** [design] Achieved-goal churners rarely return. Streak-lapsed users return at higher rates when the app sends a re-engagement push tied to a streak reset. Estimate 8–15% within six months [design].

---

## 4. Photo and video

**Churn level.** [design] Monthly churn 8–12%. Photo and video apps show the highest share of AI-powered products (61.4% per one 2026 summary) [unverified], and AI-app churn is 30–36% faster in RevenueCat's data (see anchors). Annual plans churn fastest in the AI-feature subset.

**Trial-to-paid drop-off.** The main drop is when users finish their one-off project (a wedding video, a trip edit) and never return. This is seasonal and event-driven. Free-tier export watermarks and a paywall at export are the most common triggers. Trial-to-paid at export-paywall is typically higher than at onboarding [design].

**Cancellation reason mix [design].**

| Reason id | Share |
|---|---|
| achieved_goal (one-off project finished) | 18% |
| not_using (no active projects) | 22% |
| price_too_high | 12% |
| found_free_alternative (CapCut, phone built-in editors) | 14% |
| technical_issues (export crashes, cloud sync) | 6% |
| subscription_fatigue | 5% |
| payment_failed (involuntary) | 10% |
| forgot_renewal | 6% |
| seasonal (holiday, wedding and travel seasons) | 5% |
| other | 2% |
| **Total** | **100%** |

**Refunds and chargebacks.** [design] Refund requests cluster after a large export that the user says failed or left a watermark. Video apps with heavy processing see more technical refund claims than other categories.

**Win-back.** [design] Event-driven users return when a new project appears. Expect 8–12% within six months with an event-timed offer.

---

## 5. Finance and budgeting

**Churn level.** [design] Monthly churn 5–8%, lower than most consumer categories, because bank connections create switching costs. Annual plans are common. Involuntary share about 15–20%.

**Trial-to-paid drop-off.** The main drop is when the bank link breaks, the user has no budget set, and the trial ends before they see a monthly summary. Trials that cover a full billing cycle convert better [design, consistent with RevenueCat's trial-length finding].

**Cancellation reason mix [design].**

| Reason id | Share |
|---|---|
| not_using (budget habit lapsed) | 24% |
| achieved_goal (debt paid off, savings goal hit) | 10% |
| price_too_high | 18% |
| found_free_alternative (bank's own budget tools, free trackers) | 12% |
| technical_issues (bank sync broken) | 9% |
| subscription_fatigue | 4% |
| payment_failed (involuntary) | 11% |
| forgot_renewal | 5% |
| seasonal (tax season, year-end resets) | 4% |
| other | 3% |
| **Total** | **100%** |

**Refunds and chargebacks.** [design] Refunds are rare. Chargebacks, when present, come from users who mistake the charge for a bank fee. Bank-sync failures produce "app stopped working" refund requests.

**Win-back.** [design] Win-back works best when the user's bank changes or a new year starts. Expect 6–10% reactivation within six months.

---

## 6. Dating and social

**Churn level.** Tinder payer behavior from US e-receipts: of 6,089 US Tinder subscribers who paid in July 2024–June 2026 and then stopped, 90.3% did not buy another paid dating app; about 7% moved to Bumble and about 3% to Grindr. The source's cohort definition is garbled, so treat the windows as approximate [unverified, https://ask.yipitdata.com/insights/lapsed-tinder-payers-category-exit]. RevenueCat data suggests about 20% of churned monthly subscribers reactivate within a year, ranging from 6% to 36% by category [unverified summary of RevenueCat; see anchors]. Monthly churn [design] 12–18%, the highest in this list, because the job is "find someone", and success ends the need.

**Trial-to-paid drop-off.** [design] The drop is at the first match and the first conversation. Users who match quickly and then get a bad experience cancel. Users who get no matches churn too. Both are value-based, not price-based.

**Cancellation reason mix [design].**

| Reason id | Share |
|---|---|
| achieved_goal (met a partner, relationship started) | 26% |
| not_using (no matches, low engagement) | 24% |
| price_too_high (versus free tier) | 10% |
| found_free_alternative (free apps, offline meetups, friend groups) | 9% |
| technical_issues | 3% |
| subscription_fatigue | 5% |
| payment_failed (involuntary) | 9% |
| forgot_renewal | 5% |
| seasonal (new-year spike, post-holiday drop) | 4% |
| other (safety, harassment, bad experience) | 5% |
| **Total** | **100%** |

**Refunds and chargebacks.** [design] Refund requests are common after a trial-abuse cycle (an expired trial re-subscribed, charged, then refunded). A RevenueCat community thread (August 2025) describes this, and a RevenueCat staffer says AI-app categories see higher refunds [anecdotal, https://community.revenuecat.com/general-questions-7/higher-refund-rate-6814].

**Win-back.** [design] Lapsed users return when they reset their profile or enter a new city. Expect 15–25% reactivation within six months, from the life-circumstance pattern [unverified].

---

## 7. AI assistant and creative tools

**Churn level.** The category most directly covered by 2026 data. RevenueCat 2026: AI apps churn 36% faster than non-AI apps (another summary says 30%). AI monthly plans retain 36% worse over 12 months. Monthly retention 6.1% for AI apps vs 9.5% non-AI; weekly retention is higher for AI apps (2.5% vs 1.7%) [Computing, 2026, https://www.computing.co.uk/news/2026/ai-powered-apps-struggle-retain-subscribers]. Year-1 realized LTV is 41% higher ($30.16 vs $21.37 median), so early revenue is strong and retention is weak [RevenueCat 2026, see anchors]. Involuntary share is in line with the all-app split.

**Trial-to-paid drop-off.** The drop is in the first two weeks, when the novelty of the model output fades. Users compare the app to the newest model and switch. The "try the newest model" behaviour is RevenueCat's proposed explanation [Computing, 2026].

**Cancellation reason mix [design].**

| Reason id | Share |
|---|---|
| found_free_alternative (free chatbots, newer model from another vendor) | 24% |
| not_using (novelty gone) | 22% |
| price_too_high (credits used up, usage caps) | 15% |
| subscription_fatigue (many AI subs) | 9% |
| technical_issues (latency, output quality, outages) | 6% |
| payment_failed (involuntary) | 9% |
| forgot_renewal | 5% |
| achieved_goal (project finished) | 4% |
| seasonal (school term, tax deadlines) | 2% |
| other | 4% |
| **Total** | **100%** |

**Refunds and chargebacks.** Higher than most categories. RevenueCat's AI apps show higher refund rates, a staffer's statement in a community thread [anecdotal]. Refund claims cluster around usage caps and quality complaints.

**Win-back.** Monthly AI subscribers return when a model upgrade ships. Annual AI subscribers rarely return (about 5% reactivation, the all-app annual figure) [RevenueCat 2026 part two, see anchors].

---

## 8. Meditation and wellness

**Churn level.** [design] Monthly churn 8–12%. Annual plans are common and churn heavily in Year 1 per the all-app anchor. The category has the most public signal from Headspace and Calm, but no churn number from them.

**Trial-to-paid drop-off.** The drop is at Day 0 to 3, when the user does one session and feels no change. Trials of 7 days or longer convert better [design]. Headspace-to-Calm switching: of 290 observed Headspace cancellers, 4.9% resumed Headspace within 180 days, and a separate 268-person cohort analysis covered Calm starts. Coverage is limited, and the study did not measure every alternative [YipitData, https://ask.yipitdata.com/insights/headspace-cancelers-calm-starts, undated].

**Cancellation reason mix [design].**

| Reason id | Share |
|---|---|
| not_using (habit lapsed) | 30% |
| found_free_alternative (free apps, YouTube, free courses) | 17% |
| price_too_high | 16% |
| achieved_goal (stress reduced, course finished) | 8% |
| subscription_fatigue | 6% |
| technical_issues | 4% |
| payment_failed (involuntary) | 8% |
| forgot_renewal | 5% |
| seasonal (January reset, exam periods) | 4% |
| other | 2% |
| **Total** | **100%** |

**Refunds and chargebacks.** [design] Low refund volume. Refund requests come from annual-plan buyers who used one session. A developer-forum post claims a cancellation survey with tailored offers saved 47% of cancellations [unverified, https://community.web2wave.com/t/we-halved-our-churn-rate-with-custom-win-back-offers-at-cancellation/1243].

**Win-back.** Headspace-cancellers return to Headspace at about 4.9% within 180 days [YipitData]. [design] Expect 5–8% reactivation in six months for annual plans and 15–20% for monthly plans.

---

## 9. Games and entertainment subscriptions

**Churn level.** Mobile-game subscriptions (VIP passes, battle-pass tiers) have no public category churn figure. Console subscriptions have the best recent survey data. Circana: about 40% of recent Xbox Game Pass Essential and PlayStation Plus Essential cancellers said they still liked the service but could no longer afford it; Nintendo Switch Online scored 50% [IBTimes, Circana survey, undated, https://www.ibtimes.co.uk/xbox-game-pass-cancellations-circana-survey-1819309]. These describe people who already left, not a rate of churn. [design] Mobile game subscription monthly churn 10–15%, with heavy seasonality around new-release and season-pass cycles. Gaming's trial share is low (2.9% median trial usage, Gigazine 2024, see H&F section). Battle-pass and VIP access tied to an active subscription is standard, so cancelling removes access at period end [Epic help, https://www.epicgames.com/help/c-202300000001636/c-202300000001721/why-did-i-lose-access-to-the-new-battle-pass-after-canceling-my-fortnite-crew-subscription-a202300000016043].

**Trial-to-paid drop-off.** [design] Trial use is low. The drop is in the first session, when the free content does not show the paid benefit.

**Cancellation reason mix [design].**

| Reason id | Share |
|---|---|
| subscription_fatigue (too many game and media subs) | 22% |
| price_too_high (price rises, bundled price) | 20% |
| not_using (content caught up, season finished) | 20% |
| achieved_goal (season or pass completed) | 9% |
| found_free_alternative | 6% |
| technical_issues | 4% |
| payment_failed (involuntary) | 9% |
| forgot_renewal | 5% |
| seasonal (season-pass cycles, holiday sales) | 3% |
| other | 2% |
| **Total** | **100%** |

**Refunds and chargebacks.** [design] Refund requests after accidental renewals and after in-game purchases made by children. Platform-side refunds are handled by Apple and Google, and the developer sees them as revenue loss.

**Win-back.** [design] Season-pass users return at each new season. Expect 15–25% of lapsed season-pass users to return with the next season, and 4–6% for standing monthly subscriptions. The Circana cancel-reason data is the closest available sourced figure [IBTimes, see above].

---

## Confidence and gaps

- **Strongest data:** all-app cross-category anchors (RevenueCat 2025 and 2026, Adapty, TechCrunch on AI apps). Reactivation and trial-length figures are from the same source.
- **Medium data:** Churnkey 2025 reasons (cross-SaaS, unverified read); Gigazine 2024 trial usage by category; YipitData Tinder and Headspace receipts (small cohorts, approximate windows).
- **Weak data:** every reason-mix table is a [design] estimate. Monthly and annual churn for individual categories is [design] except where a source is named.
- **Not found:** Apphud category data; Recurly consumer involuntary share (gated report; a 20–40% share figure is attributed inconsistently to Paddle and to Recurly [unverified]); Paddle or ProfitWell consumer cancellation survey; chargeback rates for subscription apps; Babbel churn; Adapty's 2025 category breakouts.

**Recommended next pulls.** RevenueCat State of Subscription Apps 2026 full PDF (per-category tables). Apphud's public benchmark pages. Recurly Key Metrics (gated, consumer-goods filter). Sensor Tower or Appfigures for Headspace, Calm, Duolingo and Tinder retention.

## Sources

- RevenueCat, "The State of Subscription Apps in 10 minutes" (2026-03-19, updated 2026-04-22): https://www-docs.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026
- RevenueCat, State of Subscription Apps 2026: https://www.revenuecat.com/state-of-subscription-apps
- RevenueCat, subscription app churn reasons (undated): https://www.revenuecat.com/blog/growth/subscription-app-churn-reasons-how-to-fix.md
- RevenueCat, benchmark definitions (undated): https://www.revenuecat.com/docs/dashboard-and-metrics/benchmarks
- RevenueCat community, higher refund rate thread (August 2025): https://community.revenuecat.com/general-questions-7/higher-refund-rate-6814
- SaaStr summary of RevenueCat 2025 report (undated): https://saastr.com/the-top-10-learnings-from-revenuecats-state-of-subscription-apps-how-115000-mobile-apps-deliver-16b-in-revenue-whats-working-whats-quietly-killing-growth
- TechCrunch, AI apps and long-term retention (2026-03-10): https://techcrunch.com/2026/03/10/ai-powered-apps-struggle-with-long-term-retention-new-report-shows
- Computing, AI-powered apps struggle to keep subscribers (2026): https://www.computing.co.uk/news/2026/ai-powered-apps-struggle-retain-subscribers
- PPC Land, RevenueCat annual subscriber reactivation and AI-app churn (undated): https://ppc.land/95-of-annual-app-subscribers-who-cancel-never-return-revenuecat-finds/ ; https://ppc.land/ai-apps-earn-41-more-per-user-but-churn-30-faster-revenuecat-finds/
- Adapty, State of in-app subscriptions 2025 in 10 minutes (undated): https://adapty.io/blog/state-of-in-app-subscriptions-2025-in-10-minutes/
- Adapty, refund guide (undated): https://uploads.adapty.io/the_guide_on_managing_refunds_for_subscription_apps.pdf ; https://adapty.io/blog/refunds-guide
- Apphud: no public benchmark page found for category data.
- Gigazine, 2024 subscription-app stats (2024-03-13): https://gigazine.net/gsc_news/en/20240313-apps-subscription-stats
- Gigazine, 2025 mobile-app subscription revenue (2025-03-18): https://gigazine.net/gsc_news/en/20250318-mobile-apps-subscriptions-revenue
- Churnkey, State of Retention 2025 (embedded data; undated): https://churnkey.co/guides/reduce-subscription-churn/_payload.json
- Recurly, press release on failed payments (2025 estimate): https://recurly.com/press/failed-payments-could-cost-subscription-companies-more-than-129-billion-in-2025-us
- Recurly, churn benchmarks docs (undated): https://docs.recurly.com/recurly-subscriptions/docs/navigate-scale-benchmarks-101-churn
- Chargeflow, involuntary churn guide (citing Recurly Research; undated): https://www.chargeflow.io/nl/blog/what-is-involuntary-churn
- Payway, failed recurring payments (undated): https://www.payway.com/?p=3087
- Paddle, cancellation flows changelog (2024): https://developer.paddle.com/changelog/2024/cancellation-flows-subscription-id-parameter-changes
- YipitData, lapsed Tinder payers (cohort through June 2026): https://ask.yipitdata.com/insights/lapsed-tinder-payers-category-exit
- YipitData, Headspace cancellers and Calm starts (undated): https://ask.yipitdata.com/insights/headspace-cancelers-calm-starts
- Business of Apps, language-learning retention (undated): https://www.businessofapps.com/?p=56781
- Duolingo FY2025 figures, secondary Substack summary (2025): https://sergeycyw.substack.com/p/duolingo-q1-2025-earnings-analysis
- Circana survey on Game Pass and PS Plus cancellations, via IBTimes (undated): https://www.ibtimes.co.uk/xbox-game-pass-cancellations-circana-survey-1819309
- Epic Games help, Fortnite Crew battle-pass access (undated): https://www.epicgames.com/help/c-202300000001636/c-202300000001721/why-did-i-lose-access-to-the-new-battle-pass-after-canceling-my-fortnite-crew-subscription-a202300000016043
- Web2Wave community post, win-back offers (undated; developer self-report): https://community.web2wave.com/t/we-halved-our-churn-rate-with-custom-win-back-offers-at-cancellation/1243
- Sexuality & Culture (2025), Mogollón Márquez and Neves, dating app discontinuance (cited, not read): https://run.unl.pt/entities/publication/cce33b9b-cdee-4070-8ad7-32d08c2fd45f/full
