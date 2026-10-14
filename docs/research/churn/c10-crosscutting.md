# C10: Cross-cutting SaaS churn benchmarks (for the founder simulator, late 2026)

Research date: 2026-10-14. Scope: churn, retention, involuntary churn, cancellation reasons, save tactics, leading indicators and cohort curve shape. Segment-specific reason mixes (roofers, school districts, hospitals, DTC) are covered in other files in this folder and are not repeated here.

**Confidence key.** Unmarked numbers come from a primary publisher's page I opened, with URL and date. [unverified] = secondary, vendor or aggregator claim, or a figure I could only see in a search snippet. [design] = my own estimate for simulator tuning, not a sourced fact.

**Method caveat.** Searches returned mostly SEO aggregators that cite each other. Several "primary" pages (Recurly, Churnkey, SaaS Capital) were checked by fetching them. The KeyBanc/Sapphire churn medians, the ProfitWell/Paddle reason-share breakdown and the ChartMogul ACV tables could not be extracted (the figures sit in chart images or PDFs I could not read). Where I could not find a primary number, I say so rather than fill the gap.

---

## Headline takeaways for the simulator

1. Annual logo churn for B2B SaaS sits around 3 to 4% per year in the best-measured primary data (Recurly, 2026), but the spread by size and price is much wider than that average suggests. Churn falls steeply as price rises.
2. Involuntary (failed-payment) churn is roughly a third of all churn for SaaS in Recurly's network (about 33%), and somewhat lower in the Churnkey-only framing (about 22% of cancellations). Which base you use changes the answer a lot.
3. Low-priced AI-native products are the worst-retaining group in the best available 2025 data (ChartMogul/Growth Unhinged, Dec 2025): median GRR 40% overall, 23% GRR under $50 per month. Treat these as directional; the AI subsample is small.
4. Save flows typically recover 15 to 35% of people who start to cancel. Vendor claims run higher (34 to 54%) and should be discounted.
5. Exit-survey reason shares are weak evidence. No primary dataset with reason percentages for SaaS was retrievable. Stated reasons ("too expensive") routinely mask value problems.

---

## (A) Churn by ACV, size and contract type

### A1. Primary anchors

- **Recurly network churn, 2026 (July 2026 data).** Overall median annual churn 3.60% (voluntary 2.34%, involuntary 1.25%). SaaS vertical: total 3.22%, voluntary 2.16%, involuntary 1.06%; top-quartile SaaS total at or below 1.78%. Source: https://recurly.com/research/churn-rate-benchmarks (page states "updated with July 2026 data"; sample size and sampling method not stated). The same page is internally inconsistent: the SaaS median appears as 3.04% in body text and 3.22% in the table; the benchmark zone is given as 2 to 4% in the body and 3 to 5% in the FAQ. Use the table values and flag the inconsistency.

- **Recurly churn by price per customer (ARPC), median annual, same page.** Total / voluntary / involuntary:
  - $10 to $25: 4.29% / 2.99% / 1.30%
  - $25 to $50: 3.84% / 2.73% / 1.11%
  - $50 to $100: 3.15% / 2.41% / 0.74%
  - $100 to $250: 2.87% / 2.40% / 0.46%
  - Over $250: 3.07% / 2.90% / 0.18%
  - Derived by me from these numbers: involuntary share of total churn is about 30% at $10 to $25, 29% at $25 to $50, 23% at $50 to $100, 16% at $100 to $250 and 6% above $250. Recurly's own FAQ says the 2% monthly rate roughly equals 22% annual, which checks out (1 - 0.98^12 = 21.5%).

- **SaaS Capital, 2025 private B2B retention benchmarks, by ACV.** Published 18 Sep 2025 at https://www.saas-capital.com/research/saas-retention-benchmarks-for-private-b2b-companies/. Survey is annual, private, scale-up-sized SaaS, benchmarked by ACV rather than size. Text confirms: for $25k to $50k ACV, median NRR 102%, top quartile 111%, bottom quartile 97%. The per-band medians are only in a chart I could not read. Growth context: median growth 24% for companies over $1M ARR; companies with NRR at or above 110% grew faster. Secondary summary [unverified] (https://prospeo.io/s/net-revenue-retention, undated) gives median NRR about 96% under $1k ACV, 102% at $25k to $50k and 108% above $100k. Use this shape (NRR rises with ACV) but not the exact numbers.

- **KeyBanc/Sapphire 16th Private Company SaaS Survey.** Released 13 Nov 2025 per a Barchart press-release copy (https://www.barchart.com/story/news/36109511/private-saas-company-survey-reveals-ai-driven-transformation-and-sustained-operational-excellence). The excerpt has no churn numbers. Blog claims attributing churn medians to KeyBanc [unverified] are not reliable. Pull the report PDF before citing KeyBanc churn.

- **Growth Unhinged / ChartMogul 2025 benchmarks (AI-native comparison).** Published 10 Dec 2025 at https://www.growthunhinged.com/p/the-ai-churn-wave. Dataset: about 3,500 scraped software companies, classified by AI into B2B SaaS (about 2,700), B2C SaaS (about 600) and AI-native (about 200); only companies with at least $250k ARR; annualized retention through 2025. Medians: B2B SaaS NRR 82% (upper quartile 97%); B2C SaaS NRR 49%; AI-native GRR 40%, NRR 48%. Under $50 per month AI products: GRR 23%, NRR 32%. The author labels the AI sub-buckets (about 50 each) "directional rather than statistically robust."

- **Growth Unhinged 2025 SaaS benchmarks report.** Published 12 Nov 2025 at https://kylepoyar.substack.com/p/2025-saas-benchmarks-report. More than 800 companies; respondent mix by ICP: enterprise 37%, mid-market 35%, SMB 19%, micro-business 7%, consumer 2%. The public excerpt has no churn or GRR figures by segment.

### A2. SMB vs mid-market vs enterprise

No primary source I could open gives clean GRR or logo churn by segment. The best evidence is the Recurly price-band table above, which is effectively a proxy for SMB (low ARPC) vs enterprise (high ARPC). Secondary numbers conflict widely:

- SMB annual logo churn 10 to 14% vs enterprise 2 to 5%, attributed to ChartMogul via stealthagents.com [unverified, no date].
- SMB 30 to 58% annual vs enterprise 10% or less, attributed to Recurly and Paddle data via venasolutions.com [unverified, undated]. This looks too high for the Recurly-network figures above, which put even the $10 to $25 band at 4.3% total annual churn. The gap likely reflects definitions (logo vs revenue, monthly-equivalent vs annual, self-serve micro-SaaS vs sales-led SMB).
- GRR tiers: 92 to 96% for ACV above $50k, 80 to 88% for ACV below $5k [unverified] (stealthagents.com, 2026).

[design] Working ranges for the simulator, by segment (annual gross logo churn, for a well-run company in 2026):

| Segment | ACV | Annual logo churn | Annual GRR | Notes |
|---|---|---|---|---|
| Micro/self-serve SMB | under $1k | 25 to 40% | 65 to 80% | Monthly billing dominates; failed payments ~30% of churn |
| SMB | $1k to $10k | 12 to 25% | 80 to 88% | Mix of monthly and annual |
| Mid-market | $10k to $100k | 6 to 12% | 88 to 94% | Mostly annual; renewal events matter |
| Enterprise | over $100k | 2 to 6% | 92 to 97% | Multi-year common; churn is lumpy at renewal |

### A3. Monthly vs annual contracts

- **Recurly:** annual churn medians are given, but the monthly-vs-annual split is not broken out on the page. See A1.
- **KBCM/Sapphire-derived survey, 2024 (secondary, dates inconsistent).** Churn about 14% for monthly contracts, 10% annual, 6% for 1 to 2 year, 3% for 2 to 3+ year. Source: https://research.successcoaching.co/docs/churn (an aggregator reprinting the survey; a restatement note says earlier drafts had different numbers). [unverified]
- **Fungies 2026 guide** claims annual churn 8.5% vs 16% monthly [unverified, https://fungies.io/reduce-saas-churn-guide-2026].
- **Eightx (ecommerce, 2026)** claims 8.3% monthly vs 2.1% annual [unverified, https://eightx.co/blog/average-ecommerce-subscription-churn-by-billing-period-2026]. Not SaaS.
- **Methodology warning.** Kellblog (https://www.kellblog.com/the-biggest-mistake-youre-likely-making-in-calculating-churn-annualizing-and-weighting-multi-year-atr-churn-rates/, undated) argues that multi-year contracts are excluded from the renewal pool for one to two years, so a 10% annual rate equals about 27% over three years. Do not compare multi-year and monthly churn on a simple annual basis.
- [design] Use: monthly-billed SaaS churns about 1.5 to 2.5x annual-billed on the same ACV band.

### A4. AI-native products (2025 to 2026)

- Best primary-ish data: Growth Unhinged / ChartMogul, 10 Dec 2025 (above). AI-native median GRR 40%, NRR 48%, vs B2B SaaS median NRR 82% in the same dataset, same window, companies at least $250k ARR. Sub-$50 per month AI products: GRR 23%. Sample for the AI bucket is about 200, with about 50 per sub-bucket. Source: https://www.growthunhinged.com/p/the-ai-churn-wave.
- Secondary reprints (Gainsight, Artisan Growth Strategies, Userpilot) cite the same dataset; do not count them as independent confirmation.
- "AI tourist" effect. a16z's growth team is reported (via a Product Hunt summary, undated, https://www.producthunt.com/p/murror/every-number-that-says-your-ai-product-is-working-arrives-before-the-one-that-says-it-isn-t [unverified]) to argue that many early AI churners try the product once out of curiosity, and that anchoring retention at signup inflates the denominator. Suggested fix: measure from month 3. I could not find a16z's primary publication. Userpilot [unverified, undated, https://userpilot.com/blog/churn-rate-vs-retention-rate/] attributes to a16z a finding that AI retention curves flatten around month 3.
- Mechanism: users churn when they cannot justify the output to themselves or to a boss; legacy health signals (logins, NPS) fire too late (Userpilot [unverified]).
- [design] Simulator rule: AI-native self-serve under $50 per month: 30 to 45% of signups churn within 30 days; the cohort then flattens. AI sold at $200+ per month to teams: annual GRR 70 to 85%.

---

## (B) Involuntary churn

### B1. Share of total churn

- **Recurly 2026 network (primary):** involuntary 1.25 of 3.60 total = about 35%. SaaS: 1.06 of 3.22 = about 33%. Education: 1.69 of 4.99 = about 34%. Source: https://recurly.com/research/churn-rate-benchmarks.
- **Churnkey (primary page, updated 25 Feb 2026):** "20-40% of your overall churn" with no methodology; quotes Reid Tandy saying involuntary cancels can be 25 to 50% of total cancels and roughly 5% of paying subscribers are past due at any moment (https://www.churnkey.co/blog/involuntary-churn, first published 3 Jul 2024). A separate Churnkey figure puts involuntary at 22% of cancellations across 5.4M failed payments [unverified, https://churnkey.co/guides/reduce-involuntary-churn].
- **Subscription Index (Jan 17 2026)** reports the Churnkey/Stripe benchmark reports; the shares are in charts I could not read (https://subscriptionindex.beehiiv.com/p/new-benchmarks-for-voluntary-involuntary-churn). Dataset: Churnkey processes 5.4M failed payments and 25M subscriptions a year; Stripe about $1.4T in payments and 200M subscriptions.
- The 20 to 40% and 22% figures likely differ because one is a share of cancels and the other a share of all churn including downgrades and non-renewals. Recurly's ARPC table shows the involuntary share falls sharply with price (about 30% under $50 per month, 6% over $250 per month).
- Paddle's "20 to 40%" claim appears only as a secondary citation [unverified].

### B2. Card decline reasons

Churnkey's analysis of 5.4M failed payments, as reproduced in its guide (undated; https://churnkey.co/guides/reduce-involuntary-churn [unverified]):
- Insufficient funds about 40.6%
- Transaction not allowed about 8.8%
- Highest risk level about 8.0%
- Do Not Honor about 7.6%
- Generic decline about 5.8%
- Incorrect number about 4.7%
- Expired card about 1.1%

Churnkey also says soft declines are 80 to 90% of failures [unverified]. Soft (retryable) includes insufficient funds and Do Not Honor; hard (non-retryable) includes lost, stolen, incorrect number and similar.

Stripe's documentation (https://docs.stripe.com/billing/revenue-recovery/smart-retries, live page) lists the hard decline codes that Stripe will not retry without a new payment method: incorrect_number, lost_card, pickup_card, stolen_card, revocation_of_authorization, revocation_of_all_authorizations, authentication_required, highest_risk_level, transaction_not_allowed. Note that highest_risk_level and transaction_not_allowed are non-retryable under Stripe's rules even though they appear in Churnkey's list of common declines, so a dunning forecast should not count them as recoverable by retries alone.

Older data (undated, very likely pre-2020): Forrester/Digital River survey, insufficient funds 59%, card credit limit 42% (cited in the Churnkey article) [unverified].

### B3. Dunning and recovery rates

- **Recurly's "47.6% median recovery" figure.** Attributed by Orb to Recurly and by Yuno (2026) to the 2025 median; top performers 70 to 85%. Yuno warns that recovery rates are not comparable across vendors because denominators and windows differ [unverified, https://y.uno/en/blog/how-to-actually-measure-failed-payment-recovery.md, 2026]. Could not confirm against Recurly's own page.
- **Recurly's "$129B" lost-revenue estimate.** Press release dated January 2024, project for 2025, which I could only see referenced [unverified; https://recurly.com/press/failed-payments-could-cost-subscription-companies-more-than-129-billion-in-2025-us].
- **Churnkey** claims up to 89% of failed payments can be recovered with its tools (product claim, no methodology, https://www.churnkey.co/blog/involuntary-churn, updated 25 Feb 2026).
- **Stripe.** Its marketing figure of 55% average recovery for Stripe Billing customers is reported second-hand by Redux Payments [unverified, https://www.reduxpayments.com/blog/stripe-smart-retries-explained, undated]. Redux's own audit of 200+ B2C accounts found 25 to 35%. Churnkey reports about 38% average recovery for Stripe tools [unverified]. A DEV post puts Smart Retries alone at about 38% of failed recurring charges [unverified].
- Stripe's documented default: Smart Retries, recommended 8 tries within 2 weeks; you can also set up to three custom retries, and at the end you can cancel, mark unpaid, leave past_due, or pause eligible subscriptions (https://docs.stripe.com/billing/revenue-recovery/smart-retries).
- Stripe ACH/SEPA retry limits (for reference): ACH 2 retries over 40 days for insufficient funds; SEPA 2 over 30 days (same Stripe page).
- [design] Simulator defaults: a good dunning stack recovers 35 to 55% of soft-declined invoices within 30 days; hard-declined invoices recover at under 10% without a card update.

### B4. Card updater effect

No primary source I could open quantifies Card Account Updater (Visa/Mastercard account updater networks) or Stripe's automatic card updates. Stripe documents the feature as syncing new expiry dates from card networks (https://docs.stripe.com/billing/revenue-recovery/smart-retries, live). A DEV post estimates 60 to 70% of card changes are caught [unverified, undated]. The Churnkey article says card-updater features exist but gives no effect size. [design] Simulator: updater catches about half of expiry-driven failures before the first retry, and roughly 15 to 25% of all soft-decline recovery.

### B5. Practical rule of thumb

Subscription Index's compounding check (Jan 2026): 5% monthly churn is about 46% annual; 10% is about 72% annual. Recurly's SaaS involuntary of about 1 point a year implies a dunning program that fails to recover on about a 2% annual base of paying subscriptions. Better dunning moves involuntary churn by fractions of a point, not multiples. That matters for the simulator: failed payments are a steady leak, not a dominant driver for mid-market.

---

## (C) Voluntary churn reason taxonomies

### C1. What exists

- **Paddle Retain cancellation flow** default reason options: "not useful right now", "didn't see the value", "poor support", "missing features", "other" (https://developer.paddle.com/build/retain/configure-cancellation-flows-surveys.md, Paddle developer docs, 2024 changelog). Notably, "too expensive" is not a default option. Paddle publishes no reason-share distribution in the pages I opened.
- **Baremetrics** pulls cancellation reasons from Stripe's self-serve cancel page, including values like too_expensive and unused. It is a feature, not a dataset (https://changelog.baremetrics.com/new-stripe-cancellation-reasons-37tySY, undated).
- **Churnkey** computes a reason's selection rate only from sessions where that reason was displayed (docs.churnkey.co, cancellation trends, undated). This matters because fixed menus change the shares.
- **ProfitWell** (now Paddle) is said by Enterpret (undated, https://www.enterpret.com/guides/the-6-best-tools-to-analyze-cancellation-and-exit-survey-responses-at-scale) to show roughly 20% of churn reasons drive 80% of departures [unverified]. I could not find the underlying ProfitWell report.
- **Chargebee** publishes save and deflect definitions, not reason shares (https://www.chargebee.com/docs/growth/reporting/key-metrics-glossary).

I could not retrieve a primary reason-share table from ProfitWell, Paddle, Churnkey or Baremetrics for 2023 to 2026. The shares below are therefore [design] estimates for a generic B2B or prosumer SaaS, not measured results.

### C2. [design] Voluntary reason mix, generic self-serve and SMB SaaS, 2026

| Reason id | Est. share of voluntary churn | Note |
|---|---|---|
| not_using / low_adoption | 25 to 30% | Largest bucket in most exit surveys; often the true cause behind "price" |
| price_too_high | 12 to 18% | Often a value problem; see C3 |
| business_closed | 8 to 12% | Higher for SMB and local services |
| switched_competitor | 8 to 12% | Rises with AI-tool substitution in 2025 to 2026 |
| missing_feature | 6 to 10% | Mostly from power users |
| onboarding_failed / never_activated | 5 to 10% | Often mislabelled as "not using" |
| budget_cut | 4 to 7% | Spikes in fiscal-year-end cycles |
| champion_left | 3 to 6% | Mid-market and enterprise higher |
| acquired_or_merged | 2 to 4% | |
| poor_support / bugs_reliability | 4 to 7% combined | |
| platform_built_in | 2 to 5% | Shopify, Microsoft, Google bundling |
| other | 5 to 8% | |

Sum is about 100%. Expect enterprise to shift toward champion_left, consolidated_vendors and contract_term_end_rfp; expect micro-SMB to shift toward business_closed and price_too_high.

### C3. How reliable are exit surveys?

Weak, for three reasons:

1. **"Price" is a proxy.** Enterpret argues that "too expensive" usually means "I never saw enough value to justify the price" (https://www.enterpret.com/guides/the-6-best-tools-to-analyze-cancellation-and-exit-survey-responses-at-scale, undated). A UserIntuition guide claims the stated reason matches the actual driver less than 27% of the time, without naming a study [unverified, https://www.userintuition.ai/reference-guides/why-customers-canceling-subscriptions/]. Treat the 27% as an unsupported claim, but the direction is plausible.
2. **Menus shape answers.** Paddle's default menu omits price entirely, so price share depends on whether the menu offers it. Churnkey's per-reason shares are conditional on display. Compare vendors only when their menus match.
3. **Non-response bias.** Exit surveys reach people who finish the flow; silent churners and failed-payment churners rarely answer. Involuntary churn is almost never in the survey at all.

[design] Rule for the simulator: treat "price" in a survey as a 50/50 mix of real price and missing value. Treat "not using" as the best proxy for weak activation.

---

## (D) Save and retention tactics

### D1. Cancel-flow offers

- **Save rate definition.** Chargebee: saved subscribers divided by cancel-page sessions, with a 30-day save interval (https://www.chargebee.com/docs/growth/reporting/key-metrics-glossary, undated). A "deflect" is a visitor who stays on the page without cancelling.
- **Churnkey's vendor claims.** 54% save rate for customers who intend to cancel (https://churnkey.co/comparisons/churn-buster-vs-churnkey, undated); a Userpilot post cites its platform average as 34% [unverified]. Churnkey's Subscription Index sponsorship claims it saves 20 to 40% of subscription revenue at risk [unverified].
- **Third-party ranges.** Well-optimised flows: 10 to 34% (Userpilot, undated) [unverified]; 25 to 35% (cancellation guide, undated) [unverified]; vendor-reported cluster 15 to 25% [unverified].
- **Paddle.** Says flows save over a quarter of at-risk customers, and an older changelog claims churn reduction of up to 30% "in our testing" (https://developer.paddle.com/concepts/retain/cancellation-flows-surveys, undated; changelog 2023) [unverified, vendor].
- **Offer-level benchmarks.** Offer acceptance 15 to 25% of impressions, best-in-class 25 to 35%; pause adoption 10 to 20% where offered; source is a skills site with no origin stated [unverified, https://skillselion.com/skills/coreyhaines31/marketingskills/churn-prevention]. I found no discount-acceptance or downgrade-acceptance rates with a named source.
- **Pause.** Userpilot says businesses that enable pausing see about 25% of would-be cancellers pause instead [unverified, undated].
- [design] Typical outcome for an unassisted, well-built flow with one discount and one pause option: 15 to 25% saved, of which about half pause or downgrade rather than stay on full price. Discounts give the least durable saves (they reverse at discount expiry and cut revenue per retained account). Pauses give the most reactivation.

### D2. Annual plans

- Annual contracts cut logo churn by roughly 30 to 60% vs monthly (see A3). The effect is partly mechanical (no renewal decision for 12 months), so it inflates measured retention without improving product fit.
- [design] Annual-plan renewals: expect 20 to 30% of renewal decisions to be cancellations or downgrades, concentrated in the notice window before the renewal date.

### D3. Onboarding and time-to-value

- **Userpilot 2025 benchmark report** (547 SaaS companies, undated page https://userpilot.com/blog/time-to-value): median time-to-value about 1 day, 12 hours, 23 minutes. Average activation 37.5% (from 62 companies, so small sample); average one-month retention 46.9% (83 companies). A third-party post labels the 37.5% figure as 2024 (DEV, undated) [unverified attribution].
- Userpilot's proposed test: compare 30-day retention between users who hit the candidate first-value event within 48 hours and those who did not; a gap of 10 to 15 points indicates a real first-value event (method, not a measured industry result).
- Stripe-style trial design: no primary figures retrieved.
- [design] Simulator rule: a user who has not reached first value within 7 days has roughly twice the monthly churn of one who has. Use this as a directional multiplier, not a benchmark.

### D4. Customer success touch models by ACV

I found no primary benchmark linking touch model to churn. Working [design] rule by ACV:
- Under $1k: tech-touch only (in-app, email, help center). Human touch only when a plan is downgraded or a card fails.
- $1k to $10k: pooled CS, one review per quarter for accounts above $5k; onboarding call in the first 14 days.
- $10k to $100k: named CSM or fractional CS, QBRs or semi-annual business reviews, executive sponsor on renewal.
- Over $100k: named CSM, QBRs, executive sponsor program, multi-threading across three or more contacts.

### D5. QBRs

No primary churn-effect figure found. Expect QBRs to matter mainly for accounts above $25k, where they surface champion change and budget risk early. [design]

### D6. Multi-year deals

- **KBCM/Sapphire-derived survey, 2024 (secondary).** Churn about 14% monthly, 10% annual, 6% for 1 to 2 years, 3% for 2 to 3+ years (https://research.successcoaching.co/docs/churn [unverified]). The same source notes earlier figures were corrected.
- **Discounts.** KeyBanc benchmarks cited second-hand: 10 to 15% for two-year and 20 to 25% for three-year deals (https://www.getmonetizely.com/articles/multi-year-contracts-optimizing-pricing-strategies-for-long-term-saas-success, undated) [unverified].
- **Vendor claims.** 30 to 50% lower churn on multi-year deals, no study cited [unverified, getmonetizely.com].
- [design] Use: a 2 to 3 year term reduces annual churn exposure to about 40 to 60% of the annual-plan rate, with a discount of 10 to 20%.

### D7. Net-revenue expansion

- SaaS Capital (Sep 2025): NRR at or above 110% correlates with faster growth (text confirms, no exact numbers). https://www.saas-capital.com/research/saas-retention-benchmarks-for-private-b2b-companies/.
- ChartMogul H1 2024 (secondary, [unverified]): median company with NRR at or above 100% grew 48% year over year, more than twice the rate of companies below 100%.
- [design] Expansion helps only where it outpaces the gross churn. Simulator: a $25k to $50k ACV account needs roughly 5 to 8% annual expansion to offset 3 to 5% gross churn.

### D8. Integrations and switching cost

- **PartnerStack** (reported Apr 2026 by Affilitizer) found 60% of surveyed companies say customers with activated integrations cancel less [unverified, survey].
- **Partnerfleet / 2025 State of SaaS Integrations:** 98% of companies say integrated customers are less likely to churn (perception, not measured) [unverified, https://partnerfleet.io/blog/valuable-integration-statistics-to-know, 2026 page].
- **Crossbeam 2023** self-reported churn reduction 50 to 79% (by company size) [unverified, 2023].
- The strongest measured-style fact here is a negative one: 30% of companies do not track integration impact on churn (secondary). Direction is consistent across sources; magnitude is not.
- [design] Simulator: an activated integration cuts annual logo churn by 20 to 35% relative, with larger effect for accounts above $10k ACV.

---

## (E) Leading indicators and health scores

### E1. What the sources say

- Health-score guides group signals into product usage, relationship/stakeholder health, support load and sometimes financial signals [unverified skill and vendor pages, e.g. https://sharedcontext.ai/skills/external/ncklrs/customer-health-analyst, undated].
- Champion departure is rated top-tier risk in most playbooks, and multi-threading is the protective factor (https://skills.cat/skills/ncklrs/startup-os-skills/customer-health-analyst, undated) [unverified].
- Usage decline is described as lagging: it usually appears after the buyer has mentally moved on (Gainsight-adjacent commentary, undated) [unverified].
- Support tickets: the trend (0 to 5 tickets in 30 days) matters more than the raw count [unverified, undated].
- Gainsight's own signal list (usage frequency, feature depth, ticket volume, login recency, NPS) comes from a competitor's write-up, not Gainsight documentation [unverified].

I could not find a primary study that ranks signals by predictive power or lead time. The numbers below are [design].

### E2. [design] Signal ranking and lead time

| Signal | Predictive strength | Typical warning | Notes |
|---|---|---|---|
| Champion leaves | High (mid-market and enterprise) | 30 to 90 days before renewal, if the vendor notices | Usually detected only via LinkedIn or a failed meeting |
| Seats or licences cut at renewal | High | 30 to 60 days | Cut seats are a strong pre-cancel tell |
| Usage down 40% or more over 30 days | High | 30 to 60 days | Better as ratio to baseline than absolute |
| Missed or failed invoice | Medium for involuntary; low for voluntary | Day of failure | Separate from voluntary; use dunning, not success plays |
| Support ticket spike (new issue type) | Medium | 14 to 45 days | Trend, not count |
| NPS or CSAT drop | Low to medium | 30 to 90 days | Most respondents are not at risk; detractors are |
| Login recency only | Low for multi-seat; medium for single-user | 14 to 30 days | Logins can be automated; watch core-action use |
| New leadership or budget season | Medium | 60 to 120 days | Often the trigger, not the signal |

[design] Overall, a combined health score built from usage ratio, seat trend and champion status typically gives 45 to 90 days of warning for annual mid-market accounts, and under 14 days for self-serve SMB, where the first signal is usually the cancel click or the failed payment.

Vendor claims of "63 days warning vs 11 days" for AI scoring [unverified, undated, https://blog.buildbetter.ai/best-customer-health-score-software-2026/] are not sourced. Do not use as a benchmark.

---

## (F) Churn curve shape by cohort month

### F1. What is documented

- ChartMogul's cohort method (https://help.chartmogul.com/hc/en-us/articles/213789989, undated) tracks churn by lifetime month, typically with churn high early and tapering. It warns not to mix annual and monthly subscriptions in one cohort.
- Userpilot's view that AI curves flatten around month 3 is unverified (see A4).
- The Baremetrics-attributed claim (customers not finishing onboarding within 7 days are 4.2x as likely to churn in the first 90 days, "2023 study") [unverified, cannot locate].
- Mixpanel-attributed 20% 90-day user retention [unverified, app-usage, not subscription].

No primary source gives cohort-month churn curves for B2B SaaS. The following shapes are [design].

### F2. [design] Monthly churn by cohort month

| Lifetime month | Self-serve SMB (monthly billing) | Mid-market (annual) | AI-native, under $50 per month |
|---|---|---|---|
| Months 1 to 3 | 6 to 12% per month (highest) | Low; renewal not yet due | 15 to 30% per month |
| Months 4 to 6 | 4 to 7% | Low | 5 to 10% per month |
| Months 7 to 11 | 2 to 4% | Low (first renewal at month 12) | 3 to 6% per month |
| Month 12 onward | 1.5 to 3% | Renewal spike at month 12 (5 to 15% of accounts); then 0.5 to 1% per month | 2 to 4% per month |

Interpretation:
- Early-life churn in SMB and AI products is mostly activation failure plus AI-tourist trial exits (see D3, A4).
- Mature churn is dominated by business-closed, budget and switching (C2).
- Mid-market churn is almost entirely renewal-timed; there is little within-year churn to model.

Sanity check against Recurly's annual medians: a self-serve SMB cohort at 2% monthly after month 12 implies about 22% annual, consistent with the "$10 to $25" band (4.3% total) only if the band is priced higher than most of this simulator's SMB. Calibrate the simulator to the ARPC band it is modelling.

---

## What I could not verify

- KeyBanc/Sapphire 2025 churn medians by segment (the report sits behind a PDF I did not open).
- ChartMogul's ACV-band churn tables (not found in readable form).
- ProfitWell/Paddle reason shares for price, value, features and support (none found; Paddle's menu excludes price).
- Save rates and offer acceptance rates with a named, dated primary source.
- Stripe's and Recurly's own recovery-rate figures (only second-hand numbers found).
- Card Account Updater effect size.
- Cohort-month churn curves for B2B SaaS.

Recommended next steps for the simulator team: download the KeyBanc 2025 PDF and the ChartMogul 2025 AI-native report; email Churnkey or Paddle for their reason-share tables; calibrate the early-life curve against a real cohort export.

---

## Sources

- Recurly churn benchmarks, July 2026 data: https://recurly.com/research/churn-rate-benchmarks
- SaaS Capital, 2025 private B2B retention benchmarks (18 Sep 2025): https://www.saas-capital.com/research/saas-retention-benchmarks-for-private-b2b-companies/
- SaaS Capital, what is a good retention rate: https://www.saas-capital.com/blog-posts/what-is-a-good-retention-rate-for-a-saas-company/
- Growth Unhinged, The AI churn wave (10 Dec 2025): https://www.growthunhinged.com/p/the-ai-churn-wave
- Growth Unhinged, 2025 SaaS benchmarks report (12 Nov 2025): https://kylepoyar.substack.com/p/2025-saas-benchmarks-report
- KeyBanc/Sapphire survey press coverage (13 Nov 2025): https://www.barchart.com/story/news/36109511/private-saas-company-survey-reveals-ai-driven-transformation-and-sustained-operational-excellence
- Churnkey, involuntary churn (first 3 Jul 2024; updated 25 Feb 2026): https://www.churnkey.co/blog/involuntary-churn
- Churnkey, reduce involuntary churn guide (undated): https://churnkey.co/guides/reduce-involuntary-churn
- Subscription Index, new benchmarks for voluntary and involuntary churn (17 Jan 2026): https://subscriptionindex.beehiiv.com/p/new-benchmarks-for-voluntary-involuntary-churn
- Stripe, automate payment retries (live docs): https://docs.stripe.com/billing/revenue-recovery/smart-retries
- Paddle, configure cancellation flows and surveys (developer docs): https://developer.paddle.com/build/retain/configure-cancellation-flows-surveys.md
- Paddle, cancellation flows concepts: https://developer.paddle.com/concepts/retain/cancellation-flows-surveys
- Baremetrics, Stripe cancellation reasons changelog: https://changelog.baremetrics.com/new-stripe-cancellation-reasons-37tySY
- Chargebee, key metrics glossary: https://www.chargebee.com/docs/growth/reporting/key-metrics-glossary
- Chargebee, retention reporting terms: https://chargebee.com/docs/retention/reporting-terms-and-definitions.html
- Churnkey, cancellation trends docs: https://docs.churnkey.co/cancel-flows/analytics/cancellation-trends
- Churnkey, Churn Buster comparison (vendor claims): https://churnkey.co/comparisons/churn-buster-vs-churnkey
- Userpilot, time to value (2025 benchmarks): https://userpilot.com/blog/time-to-value
- Userpilot, churn rate vs retention rate: https://userpilot.com/blog/churn-rate-vs-retention-rate/
- Enterpret, cancellation survey tools guide: https://www.enterpret.com/guides/the-6-best-tools-to-analyze-cancellation-and-exit-survey-responses-at-scale
- UserIntuition, why customers cancel: https://www.userintuition.ai/reference-guides/why-customers-canceling-subscriptions/
- ChartMogul, cohort analysis help: https://help.chartmogul.com/hc/en-us/articles/213789989
- Fungies, reduce SaaS churn guide 2026: https://fungies.io/reduce-saas-churn-guide-2026
- Eightx, ecommerce churn by billing period 2026: https://eightx.co/blog/average-ecommerce-subscription-churn-by-billing-period-2026
- Kellblog, annualizing multi-year churn: https://www.kellblog.com/the-biggest-mistake-youre-likely-making-in-calculating-churn-annualizing-and-weighting-multi-year-atr-churn-rates/
- Survey restatement aggregator, KBCM/Sapphire-derived churn by contract term: https://research.successcoaching.co/docs/churn
- Getmonetizely, multi-year contract pricing: https://www.getmonetizely.com/articles/multi-year-contracts-optimizing-pricing-strategies-for-long-term-saas-success
- Redux Payments, Stripe smart retries explained: https://www.reduxpayments.com/blog/stripe-smart-retries-explained
- Yuno, measuring failed-payment recovery (2026): https://y.uno/en/blog/how-to-actually-measure-failed-payment-recovery.md
- Recurly press, failed-payment cost estimate (Jan 2024): https://recurly.com/press/failed-payments-could-cost-subscription-companies-more-than-129-billion-in-2025-us
- Partnerfleet, integration statistics 2026: https://partnerfleet.io/blog/valuable-integration-statistics-to-know
- Affilitizer, PartnerStack integrations analysis (Apr 2026): https://www.affilitizer.com/news/partnerstack-analyse-integrationen-senken-churn-rate-bei-b2b-saas-unternehmen-deutlich
- Vena Solutions, SaaS churn rate: https://www.venasolutions.com/blog/saas-churn-rate
- Prospeo, net revenue retention benchmarks (secondary): https://prospeo.io/s/net-revenue-retention
- StealthAgents, SaaS churn rate statistics 2026 (secondary): https://stealthagents.com/research/saas-churn-rate-statistics-2026
- Product Hunt summary of a16z AI retention framing (undated, secondary): https://www.producthunt.com/p/murror/every-number-that-says-your-ai-product-is-working-arrives-before-the-one-that-says-it-isn-t
- BuildBetter, customer health score software 2026 (vendor claims): https://blog.buildbetter.ai/best-customer-health-score-software-2026/
- Shared-skill health analyst guide (undated, low-authority): https://sharedcontext.ai/skills/external/ncklrs/customer-health-analyst
