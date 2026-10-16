# Mobile subscription app playbook: build, monetize, acquire (2025-2026 facts)

Scope: a solo founder who builds an AI-assisted Expo/React Native app, uses a hard paywall, buys Meta installs and runs creator/clipping campaigns. Numbers are sourced where possible. Items marked [unverified] came from a single secondary source or could not be confirmed. Items marked [design] are simulator assumptions, not statistics. Research date: October 2026.

## 1. Building and shipping

- **Expo / EAS pricing.** Free plan: 15 Android + 15 iOS builds/month, 1K update MAUs, 60 min CI (expo.dev/pricing, docs.expo.dev/billing/plans). Starter is $19/month plus usage. Production is listed at $199/month by a single third-party source [unverified]. Medium build prices (about $1 Android, $2 iOS) come from a review citing Expo rates [unverified]. Check expo.dev/pricing before relying on any figure.
- **Apple Developer Program:** $99/year (Apple developer page, long-standing; not re-verified in this search).
- **Google Play Console:** one-time $25 registration (long-standing; not confirmed in this search).
- **TestFlight:** free; the standard limit for external testers is 10,000 per app and 100 internal (from Apple documentation as known; re-check).
- **App Review timing.** Apple states 90% of submissions are reviewed within 24 hours, and a June 2026 report (via 9to5Mac, secondhand) says 90% within 48 hours with a 1.5-day average. Tracker data shows about 6-14 hours in the waiting queue plus about 1 hour in review in 2026 [design: plan for 1-3 days per submission, plus a resubmission cycle].
- **Rejection rates and reasons.** A 2025 blog citing Apple's transparency data reports 9.1M submissions reviewed and over 2M rejected in 2025, with about 371,000 for copying/spam/misleading [unverified, secondhand]. No credible 2025 count per guideline was found. The only per-guideline breakdown is from 2018 (2.1 App Completeness 42%, 4.3 Spam 10%, 5.1.1 Privacy 8%, 2.3.3 Metadata 8%, 3.1.1 IAP 5%), so treat it as dated. Practical implications for this playbook:
  - **4.3 (spam / copycat):** an AI-generated clone of a popular category app is a high-risk submission. Differentiate in function and metadata.
  - **3.1.1 (IAP):** digital features must use Apple IAP. Do not put a web checkout inside the app except under the rules in section 2.
  - **5.1.1 (privacy):** the app needs a privacy policy URL, a privacy nutrition label and accurate permission strings. AI-built apps often miss these.
  - **3.1.2 (subscriptions):** price, period and renewal terms must be clear and conspicuous. Apple reportedly began rejecting toggle paywalls that switch free trials on and off in January 2026 [unverified, secondhand from Adapty and RevenueCat].

Sources: https://developer.apple.com/app-store/review/ ; https://www.choicely.com/tutorials/how-long-does-app-review-take ; https://blakecrosley.com/blog/app-review-what-reviewers-look-for-2026 ; https://adapty.io/blog/your-toggle-paywall-is-about-to-get-rejected/

## 2. Monetization and fees

**Platform commissions**
- **Apple Small Business Program:** 15% for developers whose prior-year proceeds are at or under $1M, 30% above that. Crossing the threshold moves you to 30% for the rest of that year. The rate applies to subscriptions from year one under this program. Source: https://developer.apple.com/app-store/small-business-program/ (secondary summary: https://adapty.io/blog/app-store-small-business-program/).
- **Apple, US external links.** Epic v. Apple: the April 2025 injunction barred commissions and link restrictions. The Ninth Circuit (December 2025) largely upheld the contempt finding but held that total bans were overbroad. Apple may charge a commission limited to costs "genuinely and reasonably necessary". The case was remanded to set that commission, and Apple sought Supreme Court review. Current status as of October 2026 is unconfirmed [unverified]. Do not assume a zero-fee web link is safe without checking the N.D. Cal. docket.
- **Google Play, post-Epic changes.** Reported changes take effect June 30, 2026 in the US, UK and EEA: about 10% service fee for developers under $1M a year, plus a 5% billing fee where Google Play Billing is used [unverified, several conflicting secondary sources]. Check Play Console policy pages. The 15% subscription rate from 2022 is the long-standing baseline.

**Subscription tooling (vendor fees are on top of store fees)**
- **RevenueCat:** free to $2,500 monthly tracked revenue, then 1% [secondary sources, check vendor page].
- **Superwall:** free to $10,000 monthly attributed revenue on its Indie plan; paid plans add a base fee plus 1% [secondary].
- **Adapty:** sources disagree on the free tier ($2,500 or $5,000 MTR); paid rate 1% [unverified].

**Paywall structure: download-to-paid and trial-to-paid**
- RevenueCat State of Subscription Apps 2026 (blog): median Day-35 trial-to-paid is 10.7% for hard paywalls versus 2.1% for freemium. Hard paywall conversion fell to about 12.1% (2025) after a further drop [secondary reading of RevenueCat blog]. Hard-paywall apps earn $3.09 per install by Day 60, against $0.38 for freemium. One-year subscriber retention is about 27% (hard) versus 28% (freemium), described as statistically negligible. Source: https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026
- Adapty State of In-App Subscriptions 2025: no-trial paywalls reach roughly 18-38% download-to-paid in most categories, with install-to-trial mostly under 12%. Trials raise LTV (one Adapty post says up to 64% higher for trial starters) [vendor claim]. Source: https://adapty.io/reports/state-of-in-app-subscriptions-2025/
- Cancellations cluster early. RevenueCat reports more than 60% of conversions occur within a week, and 55% of 3-day-trial cancellations occur on Day 0 (secondary summary).
- **Refund rates by paywall type:** not found in this search [unverified]. Treat hard-paywall refund and chargeback spikes as a risk to model [design].

**Plan length (RevenueCat, 10,000+ apps, undated post):** one-year median retention is about 3% for weekly plans, 11% for monthly and 28% for annual. The 2026 State of Subscription Apps reports annual renewals at 83.4% overall, and annual reactivation of only about 5%. AI apps show lower annual retention (21.1% vs 30.7% for non-AI) and higher weekly retention (2.5% vs 1.7%) [secondary summaries]. Weekly plans maximize early cash and churn fastest.

**Price points and paywall testing:** no reliable 2025-2026 price-point benchmark by category was found [unverified]. Use A/B or cohort tests with a minimum of several hundred paywall views per arm [design].

**Onboarding quiz before paywall:** no sourced conversion lift figure found [unverified]; the vendor blogs cite it mainly qualitatively.

## 3. Meta ads for apps

- **CPI.** No subscription-app-specific Meta CPI benchmark by country was found. Superads (all industries, all countries) shows a median CPI falling from about $18 (June 2025) to about $12 (June 2026) [directional, unverified]. data.ai's 2024 data puts US iOS installs at about $3.50 for non-gaming apps, India about $0.28 and Brazil about $0.65 [dated]. Fintech and subscription apps are reported to pay more for narrow high-value audiences [anecdotal]. Source: https://www.superads.ai/facebook-ads-costs/cost-per-app-install
- **Cost per trial/purchase:** not sourced. Use the simulator rule that cost per purchase is about cost per install divided by install-to-paid conversion. At a 2% install-to-paid rate and a $10 CPI, the cost per paying user is about $500 [design arithmetic].
- **Learning phase.** Meta's developer guidance says about 50 optimization events per ad set per week [official-style]. Third-party posts claim lower thresholds (25 or 10) without a Meta source [unverified]. Low event volume raises cost per result.
- **AEM and iOS attribution.** SKAdNetwork and Aggregated Event Measurement limit conversion events and reporting delay. The "8 events" limit was not confirmed in this search [unverified]. Plan for delayed, modeled attribution.
- **Advantage+ app campaigns:** automate audiences and placements. Results are highly dependent on creative volume and event quality [design].
- **Creative fatigue cadence:** not sourced. Plan for weekly new creatives and kill rules [design].
- **Share of indie apps that reach profitable payback:** no sourced figure found. RevenueCat reports that roughly 5% of apps exceed $10k monthly revenue within two years; only about half of apps at $1k reach $2.5k [secondary summary of RevenueCat 2025 data]. Use that as the base rate for the simulator.

## 4. Outcomes and failure modes

- **Revenue distribution.** About 19% of new apps crossed $1k MRR in 2024 and 17% in 2025. About 5.3% crossed $10k in 2024 and 4.6% in 2025 (RevenueCat 2026 report, secondary). Median time to $1k MRR was 60 days across apps (education 79 days, shopping 90, travel 121) [RevenueCat 2025 data, secondary]. The median time to $10k was not found.
- **Survivorship bias.** Founder posts that claim "it could not be easier" are drawn from the top of a steep distribution. The top 10% of apps grew MRR 306% in the year, while the top 25% grew 80% (RevenueCat 2026).
- **Failure modes to model:**
  - **Copycat saturation** and 4.3 rejection.
  - **Rising ad costs** when many apps buy the same audiences.
  - **Review rejection** and resubmission delay.
  - **Refund and chargeback spikes** from weekly plans and unclear pricing (3.1.2).
  - **Cancellation churn** concentrated in Days 0-7 of the trial and in the first annual month.
  - **Platform fee changes** (Apple US link-out, Google June 2026 changes).
- **FTC click-to-cancel rule:** the 2024 amended rule was vacated by the Eighth Circuit in July 2025 (Custom Communications v. FTC). The FTC opened a new negative-option rulemaking in 2026. ROSCA still applies to online subscriptions: clear disclosure, express consent and a simple cancel path. Source: https://www.bclplaw.com/en-US/events-insights-news/im-not-dead-yet-is-the-demise-of-the-ftcs-click-to-cancel-exaggerated.html . Check the Federal Register for the latest status.
- **State auto-renewal laws** (for example California's) apply separately; check current requirements [unverified].

## 5. Category examples

No individual app economics were sourced in this pass. Qualitative patterns from the sources above, to be checked before use:
- **AI photo, calorie, fitness and language apps:** high early install volume, weekly-plan-heavy paywalls, and AI inference cost that compresses margin. AI apps show weaker annual retention than non-AI apps (21.1% vs 30.7%) [RevenueCat 2026, secondary].
- **Study and education apps:** reached $1k in about 79 days (RevenueCat, secondary), with annual plans more common.
- **Shopping and travel apps:** slower to first $1k (90 and 121 days).

Simulator guidance [design]: model AI inference per user, store fees, vendor fees, CPI by country, trial-to-paid, annual renewal, refunds and review delay as explicit parameters with sources.

## Open items

1. Verify current Apple US link-out commission status (N.D. Cal. docket and Supreme Court action).
2. Verify Google Play June 2026 fee structure in Play Console.
3. Obtain Meta CPI and CPA benchmarks for subscription apps by country tier (Meta Ads Manager, AppsFlyer/Adjust reports).
4. Obtain refund and chargeback rates by paywall type and plan length.
5. Confirm the Expo Production plan price and build costs on expo.dev.
