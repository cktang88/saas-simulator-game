# Churn reasons by customer segment: research synthesis for the founder simulator

Compiled 2026-10-14 from ten research notes (`docs/research/churn/c1..c10`, copied unchanged, plus `BRIEF.md`). The data shipped to the game lives in `public/data/churn-reasons.js`; this page explains where its numbers come from, how conflicts were resolved and how far to trust them.

**How to read the numbers.**
- **Sourced** facts carry a URL and date as given in the notes. Where the notes only saw a snippet, a vendor page or an aggregator, the flag **[unverified]** is preserved.
- **[design]** marks an estimate made in the notes or by this synthesis. Almost every segment-level churn range, reason share, save rate and lead time is [design]: no independent source publishes cancellation-reason mixes for these verticals. Never show a [design] value to players as a real statistic.
- Reason mixes are shares of churned **logos**. The notes' reason tables were estimates anchored on adjacent evidence, not measurements.
- The notes cover the 30 buyer segments in `public/data/buyer-segments.js` and nine B2C app categories.

## 1. Cross-cutting benchmarks

### 1.1 Churn by ACV, size and contract

**Primary-ish anchors (sourced).**
- Recurly network churn, July 2026 data: overall 3.60% (2.34% voluntary, 1.25% involuntary); SaaS 3.22% (2.16% / 1.06%); top-quartile SaaS at or below 1.78%. Sample size and method not stated, and the page contradicts itself (SaaS median 3.04% in text vs 3.22% in the table; "annual" in the heading but its FAQ equates 2% monthly with 22% annual). https://recurly.com/research/churn-rate-benchmarks (accessed 2026-10-14).
- SaaS Capital private B2B retention benchmarks (2025-09-18): median NRR 102% at $25k-$50k ACV (top quartile 111%, bottom 97%); per-band medians only in a chart. https://www.saas-capital.com/research/saas-retention-benchmarks-for-private-b2b-companies/
- ChartMogul / Growth Unhinged (2025-12-10), about 3,500 companies of at least $250k ARR: B2B SaaS median NRR 82%, B2C SaaS 49%, AI-native GRR 40% (NRR 48%), AI products under $50 a month GRR 23%. The AI sub-buckets are about 50 companies each ("directional"). https://www.growthunhinged.com/p/the-ai-churn-wave
- Vertical-SaaS disclosures used as proxies: ServiceTitan GDR above 95% (customers above $10K only); Procore GRR 95% / NRR 106% (FY2025); Motive NDR 109-110% (Core) and 125-126% (Large); Weave GRR 89% / NRR 93% (2025). See the segment sections.

**Working ranges for the simulator ([design], annual gross logo churn for a well-run company in 2026).**

| ACV band | Annual logo churn | Annual GRR | Involuntary share of churn |
|---|---|---|---|
| Micro / self-serve SMB (under $1k) | 25%-40% | 65%-80% | about 30% |
| SMB ($1k-$10k) | 12%-25% | 80%-88% | about 22% |
| Mid-market ($10k-$100k) | 6%-12% | 88%-94% | about 10% |
| Enterprise (over $100k) | 2%-6% | 92%-97% | about 3% |

**Monthly vs annual contracts.** Monthly-billed SaaS churns about 1.5-2.5x an annual plan in the same ACV band [design]. A 2024 survey reprinted by an aggregator gives 14% (monthly), 10% (annual), 6% (1-2 years), 3% (2-3+ years) [unverified]. Annual and multi-year terms cut logo churn 30-60% but partly mechanically; Kellblog notes that multi-year contracts leave the renewal pool for 1-2 years, so 10% a year equals about 27% over three years (https://www.kellblog.com/the-biggest-mistake-youre-likely-making-in-calculating-churn-annualizing-and-weighting-multi-year-atr-churn-rates/, undated). Expect 20-30% of annual renewal decisions to be cancellations or downgrades [design]. A 2-3 year term cuts annual exposure to about 40-60% of the annual-plan rate for a 10-20% discount [design].

**AI-native products.** Under $50 a month, 30-45% of signups churn within 30 days and the cohort then flattens [design]; AI sold at $200+ a month to teams: annual GRR 70-85% [design]. Measuring from month 3 avoids the "AI tourist" denominator (an a16z framing seen only via a Product Hunt summary, [unverified]).

### 1.2 Involuntary share and recovery

| Price per customer (monthly) | Total | Voluntary | Involuntary | Involuntary share (derived) |
|---|---|---|---|---|
| $10-$25 | 4.29% | 2.99% | 1.30% | 30% |
| $25-$50 | 3.84% | 2.73% | 1.11% | 29% |
| $50-$100 | 3.15% | 2.41% | 0.74% | 23% |
| $100-$250 | 2.87% | 2.40% | 0.46% | 16% |
| over $250 | 3.07% | 2.90% | 0.18% | 6% |

Source: Recurly (above). The shares are used in the data; the levels are not (unit ambiguity, see section 1.7).

- Other shares: Recurly network 35%, SaaS 33%; Churnkey/Stripe 22% of cancellations across SaaS and 16% for B2B, 26% for AOV $30-100, 35% under $10 (https://churnkey.co/blog/involuntary-churn-benchmarks, 2025-11-14); "20-40%" vendor claims with no methodology (https://www.churnkey.co/blog/involuntary-churn, updated 2026-02-25); Stripe-cited B2B 38% annual churn of which 32 points voluntary (84%) [unverified].
- Decline codes (Churnkey, about 5.4M failed payments [unverified]): insufficient funds 40.6%, transaction not allowed 8.8%, highest risk 8.0%, do not honor 7.6%, generic 5.8%, incorrect number 4.7%, expired card 1.1%; soft declines are 80-90% of failures. Stripe will not retry highest_risk_level or transaction_not_allowed without a new payment method (https://docs.stripe.com/billing/revenue-recovery/smart-retries).
- **Recovery.** Soft declines: 35-55% recovered within 30 days; hard declines under 10% without a new card; blended default 42% [design]. Quoted figures: Recurly median 47.6% (top performers 70-85%) [unverified], Stripe marketing 55% [unverified], Redux audit of 200+ B2C accounts 25-35%, Churnkey about 38% (product claim up to 89%). Stripe's default: Smart Retries, 8 tries within 2 weeks.
- **Card updater.** No primary effect size. [design] catches about half of expiry-driven failures before the first retry and adds 15-25% to soft-decline recovery; expired cards are only about 1.1% of declines in Churnkey's data.

### 1.3 Exit-survey reliability

Weak evidence. Three reasons: (1) "price" is a proxy for "never saw enough value" (Enterpret); a UserIntuition guide claims the stated reason matches the actual driver less than 27% of the time but names no study [unverified]; (2) menus shape answers (Paddle's default menu omits price; Churnkey's reason shares are conditional on the reason being displayed); (3) non-response bias, since silent and failed-payment churners rarely answer. Shopify developers reported the April 2026 mandatory uninstall prompt returning 98% "testing multiple apps" for one app. Largest vendor sample (Churnkey, about 2M-3M cancel sessions, all SaaS): budget 33.0%, infrequent use 30.6%, other 17.9%, expectations 8.6%, technical 4.7%, alternatives 4.3%, usability 1.0% (https://churnkey.co/blog/voluntary-churn-benchmarks/, 2025-12-13).

Simulator rules [design]: treat a "price" answer as half real price and half missing value; treat "not using" as the best proxy for weak activation; business_closed is reported as "too expensive" or "cutting costs" about a third of the time; failed-payment churners almost never answer. `surveyAnswer(reasonId)` encodes this (e.g. business_closed returns a misleading answer about a third of the time).

### 1.4 Save tactics and their rates

| Tactic | Rate | Evidence |
|---|---|---|
| Cancel-flow survey with one tailored offer (`cancel_flow_offer`) | 20% | [unverified] vendor-reported or secondary, discounted |
| Pause plan (1-3 months, data kept) (`pause_plan`) | 25% | [unverified] vendor-reported or secondary, discounted |
| Downgrade: fewer seats, units or a cheaper tier (`downgrade_offer`) | 22% | [design] |
| Temporary discount (`discount_offer`) | 15% | [unverified] vendor-reported or secondary, discounted |
| Founder / executive outreach to the economic buyer or successor (`exec_outreach`) | 30% | [unverified] vendor-reported or secondary, discounted |
| Early extension / renewal with capped increase, offered before a rebid (`early_renewal_extension`) | 50% | [design] |
| Respond to an open RFP as incumbent (`rfp_defense`) | 22% | [design] |
| Multi-year term with price lock / cap (`multi_year_price_lock`) | 40% | [design] |
| Listing on a state or cooperative contract vehicle (`cooperative_contract_listing`) | 40% | [design] |
| Dunning: smart retries plus failed-payment emails (`dunning_retries`) | 42% | [unverified] vendor-reported or secondary, discounted |
| Card account updater / automatic card updates (`card_updater`) | 20% | [design] |
| Move to annual prepay at a discount (`annual_prepay_switch`) | 15% | [design] |
| Onboarding rescue: call, data import, setup help in first 14 days (`onboarding_rescue`) | 25% | [design] |
| Usage report and user survey before renewal (`renewal_survey_and_usage_report`) | 40% | [design] |
| Reach the buyer / new owner before their tech plan is fixed (`pre_close_buyer_outreach`) | 30% | [design] |
| Multi-site / group master agreement (`multi_site_master_contract`) | 25% | [design] |
| Activated integration with their core stack (`integration_switching_cost`) | 25% | [design] |
| Handoff to the new leader within 30 days (`champion_handoff`) | 30% | [design] |
| Second champion / multi-threading (finance, ops, users) (`multi_thread_second_contact`) | 30% | [design] |
| Flex pricing: per active project / per unit with parked-unit credit / seat removal (`flex_usage_pricing`) | 25% | [design] |
| Fix the issue, apologise personally, add a credit (`fix_and_credit`) | 35% | [design] |
| Document a freeze exemption (revenue, public safety, federal compliance) (`exemption_mapping`) | 40% | [design] |
| Help the buyer move the spend to another funding line (`grant_funding_relabel`) | 30% | [design] |
| Get on the franchisor / brand approved-vendor list (`approved_vendor_listing`) | 40% | [design] |
| Ship the compliance package (SOC 2, BAA, VPAT/HECVAT, validation docs) (`compliance_package`) | 45% | [design] |
| Free tier fallback instead of cancel (`free_tier_fallback`) | 20% | [design] |
| Consumer cancel flow: pause or switch to monthly (`b2c_cancel_flow_pause`) | 20% | [unverified] vendor-reported or secondary, discounted |
| Renewal reminder email before annual charge (`b2c_renewal_reminder`) | 30% | [design] |
| Streak / habit re-engagement push (`b2c_streak_reengagement`) | 15% | [design] |
| Event-timed win-back (January, new season, model upgrade, new project) (`b2c_event_timed_offer`) | 12% | [design] |

Cancel-flow benchmarks: well-built flows save 15-25% of people who start to cancel [design]; vendor claims run 34-54% (Churnkey https://churnkey.co/comparisons/churn-buster-vs-churnkey, undated) and should be discounted; Chargebee defines a save as saved subscribers over cancel-page sessions with a 30-day interval (https://www.chargebee.com/docs/growth/reporting/key-metrics-glossary). About half of saves are pause or downgrade rather than full price; discounts are the least durable; pauses give the most reactivation [design]. Pause adoption is about 25% where offered [unverified, Userpilot]. Integrated customers cancel 20-35% less (relative) [design; vendor surveys claim more, unverified]. Rates above are per at-risk account when the right offer is made in time; use the maximum that applies, not the sum.

### 1.5 Leading indicators

Ranked by assumed strength; all lead times and strengths are [design] (no primary study ranks signals; c10 section E). A combined health score (usage ratio, seat trend, champion status) typically gives 45-90 days of warning for annual mid-market accounts and under 14 days for self-serve SMB, where the first signal is usually the cancel click or the failed payment [design].

| Signal | Lead days | Strength | What the founder would see |
|---|---|---|---|
| Customer asks for a data export (`data_export_request`) | 0-14 | 0.90 | Helpdesk / inbox: "how do I export my data?" or a migration request; the strongest late signal [design]. |
| Closure, bankruptcy or lost authority is public (`closure_news`) | 0-60 | 0.85 | News / public records: bankruptcy filing, WARN notice, FMCSA authority revoked, licence lapsed, "closed for good" post, hours cut. |
| Franchisor or brand announces a technology standard (`brand_mandate`) | 180-540 | 0.85 | News / franchisor email: FDD change, "prescribed technology" notice, approved-vendor list published. |
| Champion changed job or role (`champion_departure`) | 30-90 | 0.80 | CRM / LinkedIn: the contact's job change; the Success app flags "champion left". Usually noticed only by checking LinkedIn or when an email bounces. |
| Merger, sale or roll-up announced (`acquisition_news`) | 60-180 | 0.80 | News: press release, 8-K/S-4, DSO or PE roll-up in the region, hotel sale or management change. Reach the acquirer before its tech plan is fixed. |
| RFI / RFP or sources-sought notice posted (`rfp_posted`) | 180-540 | 0.80 | Public portals: SAM.gov, state and council procurement sites, agenda items about extension or re-procurement. |
| Seat or unit count falling (`seat_decline`) | 30-60 | 0.75 | Stripe: subscription quantity decreases or a renewal quote comes back with fewer seats, locations, trucks or technicians. |
| Grant or funding line ending (`funding_cliff`) | 60-270 | 0.75 | CRM: grant end date recorded at onboarding; ESSER or pass-through funding report shows your line item ending; no new round for 12 months. |
| Usage down 40% or more vs baseline (`usage_drop`) | 30-60 | 0.70 | Analytics: active users or core actions fall against the account baseline for 30 days; weekly active share in the Success app health score drops. |
| Customer's own activity falling (`business_volume_decline`) | 30-90 | 0.70 | Analytics / integration data: fewer transactions, covers, bookings, invoices, active projects, listings or dispatches synced from the customer. |
| No first-value event within 7 days (`never_activated_7d`) | 0-30 | 0.65 | Analytics: setup unfinished, no key action by day 7 (unverified 4.2x higher 90-day churn). |
| Consumer engagement fading (`b2c_engagement_drop`) | 7-30 | 0.65 | Analytics: sessions per week fall; streak or habit lapses; no second real item created. |
| Layoffs, hiring or spending freeze (`layoffs_or_freeze`) | 30-120 | 0.60 | News / LinkedIn: customer layoffs, governor freeze order, job posts removed. Seat counts usually fall next. |
| Season ending / off-season starting (`season_end`) | 0-30 | 0.60 | Calendar: winter for roofing and HVAC, post-holiday retail, after tax season, summer slow period, end of semester. |
| Regulation, audit or approval status changing (`regulatory_change`) | 90-365 | 0.60 | News / public records: ELD vendor revoked, new state law, PUC rule, audit finding, ATO or FedRAMP status lapse. |
| Refund request (`refund_request`) | 0-7 | 0.60 | Stripe / Helpdesk: a refund ask right after a charge, often "I never used it". |
| New executive or leadership (`exec_sponsor_change`) | 60-120 | 0.55 | CRM / news: a new CIO, CFO, superintendent, pastor, mayor or managing partner. Often the trigger rather than the signal. |
| Plan or tier downgrade, or pause request (`plan_downgrade`) | 7-45 | 0.55 | Stripe: a move to a cheaper plan or a "pause" request; Shopify plan downgrade; fewer add-ons. |
| Missed invoice or declined card (`failed_payment`) | 0-7 | 0.50 | Stripe: invoice.payment_failed, subscription past_due, dunning retry count. Predicts involuntary churn; weak for voluntary. |
| Ticket spike on a new issue type (`support_ticket_spike`) | 14-45 | 0.50 | Helpdesk: ticket volume per account up in 30 days, repeated tickets on the same workflow; trend matters more than count. |
| Budget season / vendor review under way (`budget_review`) | 60-180 | 0.50 | Calendar and CRM: fiscal-year budget cycle, tool-audit email, procurement asking for usage data, "software inventory" on a board agenda. |
| Competitor pitching or switch offer (`competitor_pitch`) | 14-90 | 0.50 | CRM / customer call: the customer mentions a rival, a switching discount or an AI alternative; Success app logs a competitor offer at renewal. |
| Security questionnaire stalls or is re-requested (`security_review_stall`) | 30-120 | 0.50 | Success app: procurement ask (SIG Lite, HECVAT, VPAT, BAA) goes overdue or is asked again at renewal. |
| Streak or habit broken (`streak_broken`) | 3-21 | 0.50 | Analytics: streak reset or three missed sessions in a row (language, fitness, meditation apps). |
| Project or goal completed (`goal_milestone_hit`) | 0-14 | 0.50 | Analytics: export done, course finished, goal reached, match made; the reason to subscribe has ended. |
| Annual renewal about to charge (`annual_renewal_approaching`) | 0-14 | 0.50 | Stripe: upcoming annual invoice; reminder emails and "did not expect this charge" tickets follow. |
| Term ends within 12 months, no renewal talk (`term_end_approaching`) | 90-365 | 0.45 | Success app: renewal pipeline at T-90/60/30; the term end is near and nobody has booked the conversation. |
| Owner nearing retirement or selling (`owner_succession`) | 90-365 | 0.45 | CRM / news: owner age, listing on a broker site, M&A advisor engaged, the owner stops buying new tools. |
| Rival model or app ships a big upgrade (`new_model_release`) | 7-45 | 0.45 | News: a competitor model or app release; AI-app users try the newest model and drift. |
| Card on file about to expire (`card_expiring`) | 7-30 | 0.40 | Stripe: payment method expiry date within 30 days. |
| Invoice paid late / PO delayed (`slow_invoice_payment`) | 14-60 | 0.40 | Stripe: invoices open past net terms; procurement stops answering. For invoiced buyers this is a procurement delay more often than a cancellation. |
| Platform announces a native version of your feature (`platform_announcement`) | 30-180 | 0.40 | News: Shopify Editions, Microsoft or Google release, brand-standard POS update. Merchants rarely tell you. |
| Outage or major bug hit the account (`outage_incident`) | 7-60 | 0.40 | Status page / Helpdesk: incident during their peak hours followed by an angry ticket or silence. |
| Logins fading (admin only, or none) (`login_decay`) | 14-30 | 0.35 | Analytics: last-seen date ages; only the admin logs in. Weak for multi-seat accounts (logins can be automated). |
| Account goes quiet (no tickets, no replies) (`support_silence`) | 30-60 | 0.30 | Helpdesk / inbox: an account that used to write stops writing; unanswered emails to the owner. Quiet is often worse than a spike. |
| NPS or CSAT drop (`nps_drop`) | 30-90 | 0.30 | Customers app: a detractor score or sharply lower CSAT. Most respondents are not at risk; detractors are. |

### 1.6 Curve shape by cohort month

No primary source gives B2B cohort-month curves; these are [design] (c10 section F). Compare `MARKET.*.monthlyChurn` in `public/core/params.js`.

| Lifetime month | Self-serve SMB (monthly) | Mid-market (annual) | AI-native under $50 a month |
|---|---|---|---|
| 1-3 | 6-12% a month | renewal not yet due | 15-30% a month |
| 4-6 | 4-7% | low | 5-10% |
| 7-11 | 2-4% | low (first renewal at month 12) | 3-6% |
| 12+ | 1.5-3% | renewal spike 5-15% of accounts at month 12, then 0.5-1% a month | 2-4% |

B2C apps (RevenueCat, 2026-03-19): about 72% of annual subscribers cancel in year 1 (56% in 2025), 35% of annual cancellations come in month 1, and 55.4% of 3-day-trial cancellations happen on day 0 (https://www-docs.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026). Users who have not reached first value within 7 days churn about twice as fast [design]. Segment-level `earlyLifeMult` in the data is the ratio of first-90-day to mature churn [design].

### 1.7 Conflicts and how they were resolved

1. **Level of churn: Recurly 3-4% vs everything else.** Recurly's table is labelled annual but equates 2% monthly with 22% annual and is internally inconsistent; secondary SMB figures run 10-14% (ChartMogul-attributed) to 30-58% (Optifai 2026, N=939, [unverified]). Resolution: use Recurly only for **shares** (involuntary share by ARPC) and use ACV-banded ranges for levels; the 3x spread is read as logo vs revenue, monthly-equivalent vs annual, and micro self-serve vs sales-led SMB.
2. **Involuntary share.** 16% (Churnkey/Stripe B2B), 22% (Churnkey overall), 33-35% (Recurly), "20-40%" (vendor claims), and ~12% implied by Churnkey State of Retention (7% voluntary + 1% involuntary a month). Resolution: follow the ARPC-banded curve (about 30% under $50 a month, 16% at $100-$250, 6% above $250) and the B2B figure of 16%; the 1%/7% pair is not used.
3. **Notes' reason tables vs their own prose.** The notes' `payment_failed` rows (3-10%) are below their own prose ranges (10-25%) for nine segments and below every source. Resolution: where the table value falls outside the prose range the data uses the **prose midpoint** and rescales the other reasons; segments with no `payment_failed` row (hospitals, pharma, enterprise, utilities, local/state/federal government, K-12, higher ed, banks, insurance, manufacturing, mid-market) use the prose figure. E-commerce: table 8% vs Recurly-derived 32%, set to 15% [design compromise].
4. **B2C involuntary share.** Notes' tables 8-12%, prose 15-25%, RevenueCat store split 14% (App Store) / 31% (Google Play), Recurly low-ARPC web billing about 30%. Resolution: 20% for every category as a blended default, with the store split in `CROSS.b2c`.
5. **Dunning recovery 25% to 89%.** Different denominators and windows (Yuno warns they are not comparable). Resolution: soft 35-55%, hard under 10%, blended default 42% [design].
6. **AI-app churn gap.** 30% vs 36% faster (both attributed to RevenueCat 2026) and sample sizes 75k / 115k / "over 115k". Resolution: use a 1.30-1.36 ratio and the directly stated 12-month retention 21.1% (AI) vs 30.7% (non-AI), i.e. a year-1 cancel rate of 0.79 for AI vs about 0.69 for non-AI. This is a different measure from the 72% annual-subscriber figure and the two are not mixed.
7. **B2C reactivation.** 28.9% of monthly subscribers (same price tier) in one RevenueCat summary vs about 20% within a year (6-36% by category) in another. Resolution: the lower, category-spread figure; category win-back values in the data are [design] six-month rates.
8. **Real-estate agent turnover.** 6.8% of productive agents (Recruiting Insight, 2025) vs about 16% of all agents changing brokerage (Courted, 2025). Different definitions; per-agent seat tools use the wide 15-60% range.
9. **Weave GRR 89% vs [design] logo churn 12-20%** for health practices: revenue vs logo, and larger multi-location customers stay, so the two agree.
10. **Existing `buyer-segments.js` `churnAnnual`** differs from the new ranges for five segments: hospitals 0.10 (new 3-6%), insurance 0.12 (2-10%), utilities 0.075 (3-6%), federal 0.065 (8-15%), nonprofits 0.27 (10-25%). Not edited; see the report to the caller.
11. **Game baselines vs research.** `MARKET.ent.monthlyChurn` of 1% a month is about 11% a year and `annualRenewal` 0.88 is 12% churn, against 2-5% for enterprise and 6-15% for mid-market; `MARKET.smb` settles at 3% a month (about 31% a year), the top of the SMB bands. `MARKET.b2c` (52% month-1 renew, 17% at one year) is consistent with RevenueCat. Not edited.
12. **Internal inconsistencies in the notes** (kept, flagged): the agencies mix table sums to 97% (normalised); the Inman article cited for "NAR membership -1.7% in the year to June 2026" is dated 2026-03-30; the Vendr "2025" report covers data to March 2026; Dickey's closed "97" franchised units but the cited URL slug says 85; Sonesta franchised 113 or 114 hotels depending on the source; FreightWaves SONAR gives revocations both 30% below and 31% above 2025 in one article; the Microsoft nonprofit-grant retirement is dated both mid-2025 and June 2026; the final ESSER liquidation date (2026-03-28) is unverified.

### 1.8 Data-quality summary

- Primary or near-primary numbers: Recurly page (inconsistent), Weave, ServiceTitan, Procore and Motive disclosures, Lifeway church closures, NRN/Technomic restaurant counts, RevenueCat 2026 anchors, ChartMogul AI-churn dataset, Gartner CMO survey, ABA core survey, KLAS. Everything else is vendor, aggregator or [design].
- No source gave logo churn for SaaS sold to restaurants, trades, trucking, health practices, hospitals, pharma, professional services, regulated industries, government, education, nonprofits, churches, hotels or franchises. Those ranges are [design] anchored on closure rates, M&A counts and procurement mechanics.
- No chargeback-rate data for subscription apps was found; the `chargebackRate` values are placeholders [design].
- The reason mixes are the weakest part: treat them as a prior to be shaped by game state, not as measured shares.

## 2. All segments and B2C categories at a glance

Annual churn is logo churn for B2B segments; for B2C it is the monthly churn range. "Best save" is the highest-rate tactic other than dunning (dunning and card updater apply everywhere, see 1.2). All [design] unless the segment section lists a sourced anchor.

| Segment | Annual churn | Top 3 reasons | Main timing | Best save (rate) |
|---|---|---|---|---|
| Mom-and-pop independent retail (`retail_shops`) | 12%-30% | business_closed 17%, payment_failed 15%, not_using 13% | any month; peaks Jan/Feb; first 90 days x2.5 | Pause plan (1-3 months, data kept) (25%) |
| Independent restaurants and small groups (`restaurants`) | 15%-30% | business_closed 24%, payment_failed 15%, switched_competitor 11% | any month; peaks Jan/Feb/Jul; first 90 days x2 | Multi-year term with price lock / cap (40%) |
| Salons, spas and boutique fitness studios (`salons_fitness`) | 12%-35% | payment_failed 20%, price_too_high 14%, switched_competitor 12% | any month; peaks Jan/Jul/Aug; first 90 days x2.5 | Second champion / multi-threading (finance, ops, users) (30%) |
| Trades and specialty subcontractors (roofing, HVAC, plumbing, electrical) (`trades`) | 15%-45% | payment_failed 20%, business_closed 13%, not_using 11% | any month; peaks Jan/Feb/Nov/Dec; first 90 days x3 | Pause plan (1-3 months, data kept) (30%) |
| Trucking and logistics fleets (owner-operators to mid-size carriers) (`trucking`) | 5%-45% | business_closed 21%, payment_failed 20%, price_too_high 8% | any month; first 90 days x2.5 | Multi-year term with price lock / cap (40%) |
| General contractors and mid-size construction firms (`general_contractors`) | 10%-25% | project_completed_no_renewal 13%, payment_failed 13%, switched_competitor 11% | renewal date; FY budget; peaks Jan/Nov/Dec | Multi-year term with price lock / cap (40%) |
| Independent dental, medical and veterinary practices (and DSO sites) (`health_practices`) | 12%-20% | payment_failed 20%, acquired_or_merged 16%, business_closed 11% | renewal date; peaks Jul/Aug/Dec; first 90 days x2 | Reach the buyer / new owner before their tech plan is fixed (25%) |
| Hospitals and health systems (`hospitals`) | 3%-6% | contract_term_end_rfp 22%, consolidated_vendors 18%, acquired_or_merged 14% | renewal date; FY budget; peaks Jul/Oct | Early extension / renewal with capped increase, offered before a rebid (50%) |
| Pharma, biotech and life-sciences companies (GxP) (`pharma`) | 3%-25% | business_closed 22%, budget_cut 15%, acquired_or_merged 14% | renewal date; FY budget; peaks Jan/Nov/Dec | Ship the compliance package (SOC 2, BAA, VPAT/HECVAT, validation docs) (45%) |
| Law firms (solo and small through AmLaw 200) (`law_firms`) | 12%-20% | switched_competitor 16%, price_too_high 13%, payment_failed 13% | renewal date; FY budget; peaks Jan/Nov/Dec; first 90 days x2 | Onboarding rescue: call, data import, setup help in first 14 days (25%) |
| Accounting and CPA firms (`accounting_firms`) | 8%-15% | not_using 13%, price_too_high 13%, switched_competitor 13% | renewal date; peaks May/Jun/Sep/Oct | Fix the issue, apologise personally, add a credit (35%) |
| Real estate agents and brokerages (`real_estate`) | 15%-60% | champion_left 14%, budget_cut 12%, not_using 12% | renewal date; FY budget; peaks Jan/Feb/Dec; first 90 days x2.5 | Pause plan (1-3 months, data kept) (25%) |
| Marketing and creative agencies (`agencies`) | 20%-35% | budget_cut 21%, not_using 14%, champion_left 12% | any month; FY budget; peaks Jan/Feb/Dec; first 90 days x2 | Flex pricing: per active project / per unit with parked-unit credit / seat removal (25%) |
| E-commerce and DTC brands (Shopify ecosystem) (`ecommerce`) | 25%-45% | not_using 20%, payment_failed 15%, switched_competitor 11% | any month; peaks Jan; first 90 days x4 | Onboarding rescue: call, data import, setup help in first 14 days (25%) |
| Startups and tech SMBs (10-100 employees, PLG and self-serve) (`startup_smb`) | 12%-30% | not_using 20%, budget_cut 15%, consolidated_vendors 11% | renewal date; first 90 days x2.5 | Pause plan (1-3 months, data kept) (25%) |
| Mid-market companies (100-1,000 employees) (`mid_market`) | 6%-15% | consolidated_vendors 17%, budget_cut 13%, champion_left 12% | renewal date; FY budget; peaks Nov/Dec | Usage report and user survey before renewal (40%) |
| Fortune 500 and large enterprise (`enterprise`) | 2%-5% | contract_term_end_rfp 22%, consolidated_vendors 20%, budget_cut 15% | renewal date; FY budget; peaks Dec | Early extension / renewal with capped increase, offered before a rebid (50%) |
| Hotels and hospitality groups (`hotels`) | 15%-25% | acquired_or_merged 18%, franchisor_mandated_switch 16%, champion_left 14% | any month; FY budget; peaks Jan/Sep/Oct | Reach the buyer / new owner before their tech plan is fixed (50%) |
| Franchise systems (franchisors and franchisees) (`franchise_systems`) | 10%-20% | business_closed 22%, franchisor_mandated_switch 20%, owner_retired_or_sold 12% | any month; first 90 days x2 | Get on the franchisor / brand approved-vendor list (40%) |
| Banks, credit unions and financial services (`banks`) | 6%-10% | acquired_or_merged 21%, consolidated_vendors 14%, contract_term_end_rfp 12% | renewal date; FY budget | Multi-year term with price lock / cap (40%) |
| Insurance agencies and carriers (`insurance`) | 2%-10% | acquired_or_merged 29%, consolidated_vendors 15%, owner_retired_or_sold 12% | any month | Second champion / multi-threading (finance, ops, users) (30%) |
| Manufacturing plants (`manufacturing`) | 8%-14% | acquired_or_merged 15%, business_closed 13%, consolidated_vendors 11% | any month | Flex pricing: per active project / per unit with parked-unit credit / seat removal (32%) |
| Utilities (electric, water, gas; co-ops and municipals) (`utilities`) | 3%-6% | contract_term_end_rfp 22%, acquired_or_merged 14%, consolidated_vendors 12% | renewal date; FY budget; peaks Jun/Jul | Early extension / renewal with capped increase, offered before a rebid (50%) |
| City and county government (`local_gov`) | 6%-12% | contract_term_end_rfp 30%, budget_cut 18%, champion_left 14% | renewal date; FY budget; peaks Apr/May/Jun | Early extension / renewal with capped increase, offered before a rebid (50%) |
| State government agencies (`state_gov`) | 5%-10% | budget_cut 28%, contract_term_end_rfp 22%, consolidated_vendors 12% | renewal date; FY budget; peaks Apr/May/Oct | Document a freeze exemption (revenue, public safety, federal compliance) (40%) |
| Federal government (civilian and defense) (`federal`) | 8%-15% | contract_term_end_rfp 25%, budget_cut 20%, consolidated_vendors 14% | renewal date; FY budget; peaks Sep/Oct | Early extension / renewal with capped increase, offered before a rebid (50%) |
| K-12 school districts (`k12`) | 15%-25% | budget_cut 22%, funding_ended 18%, consolidated_vendors 16% | renewal date; FY budget; peaks Jan/Feb/Jun/Jul/Aug | Multi-year term with price lock / cap (50%) |
| Colleges and universities (`higher_ed`) | 8%-15% | consolidated_vendors 20%, budget_cut 16%, champion_left 14% | renewal date; FY budget; peaks Mar/Apr/May/Jun | Usage report and user survey before renewal (42%) |
| Nonprofits and associations (`nonprofits`) | 10%-25% | budget_cut 24%, funding_ended 22%, not_using 12% | any month; FY budget; peaks Jun/Jul/Dec; first 90 days x2 | Help the buyer move the spend to another funding line (30%) |
| Churches and religious organizations (`churches`) | 12%-20% | champion_left 22%, switched_competitor 15%, business_closed 12% | any month; FY budget; peaks Jul/Aug/Nov/Dec | Handoff to the new leader within 30 days (30%) |
| B2C: Health and fitness (`health_fitness`) | 9%-12% a month; year-1 cancel 72% | not_using 32%, payment_failed 20%, price_too_high 20% | Jan/Feb/Jul/Aug; first days of trial | Renewal reminder email before annual charge (30%) |
| B2C: Productivity (`productivity`) | 7%-10% a month; year-1 cancel 70% | not_using 27%, payment_failed 20%, found_free_alternative 15% | May/Jun/Dec; first days of trial | Renewal reminder email before annual charge (30%) |
| B2C: Education and language learning (`education_language`) | 8%-12% a month; year-1 cancel 72% | not_using 25%, payment_failed 20%, achieved_goal 13% | May/Jun/Dec; first days of trial | Renewal reminder email before annual charge (30%) |
| B2C: Photo and video (`photo_video`) | 8%-12% a month; year-1 cancel 76% | payment_failed 20%, not_using 20%, achieved_goal 16% | Jan/Jun/Sep; first days of trial | Renewal reminder email before annual charge (30%) |
| B2C: Finance and budgeting (`finance`) | 5%-8% a month; year-1 cancel 62% | not_using 22%, payment_failed 20%, price_too_high 16% | Jan/Apr; first days of trial | Renewal reminder email before annual charge (30%) |
| B2C: Dating and social (`dating_social`) | 12%-18% a month; year-1 cancel 70% | achieved_goal 23%, not_using 21%, payment_failed 20% | Jan/Feb; first days of trial | Renewal reminder email before annual charge (30%) |
| B2C: AI assistants and creative tools (`ai_tools`) | 11%-15% a month; year-1 cancel 79% | found_free_alternative 21%, payment_failed 20%, not_using 19% | Jun/Dec; first days of trial | Renewal reminder email before annual charge (30%) |
| B2C: Meditation and wellness (`meditation_wellness`) | 8%-12% a month; year-1 cancel 72% | not_using 26%, payment_failed 20%, found_free_alternative 15% | Jan/May; first days of trial | Renewal reminder email before annual charge (30%) |
| B2C: Games and entertainment subscriptions (`games_entertainment`) | 10%-15% a month; year-1 cancel 72% | payment_failed 20%, subscription_fatigue 19%, price_too_high 18% | Jan/Sep/Dec; first days of trial | Renewal reminder email before annual charge (30%) |

## 3. Segment sections

Each section lists what is sourced separately from what is [design]. Reason shares are shares of churned logos in the data file (after the involuntary adjustment in 1.7 item 3).

### Mom-and-pop independent retail (`retail_shops`)

- **Churn:** 12%-30% annual logo churn (evidence: [design]). Involuntary 15.0% of churned logos (notes' prose range 10%-20%).
- **Reasons:** business_closed 17%, payment_failed 15%, not_using 13%, budget_cut 11%, price_too_high 8%, owner_retired_or_sold 7%, switched_competitor 7%.
- **Timing:** Mostly monthly plans. Closures cluster after the holidays (Jan-Feb) and at lease renewals; the vendor usually gets no notice because the owner just stops paying.
- **Leading indicators:** failed_payment (0-7 d), business_volume_decline (60-90 d), usage_drop (30-60 d), season_end (0-30 d), closure_news (0-60 d).
- **Saves:** Pause plan (1-3 months, data kept) 25%; Downgrade: fewer seats, units or a cheaper tier 22%; Dunning: smart retries plus failed-payment emails 42%; Card account updater / automatic card updates 20%.
- **Solo founder:** Offer a no-contract monthly plan with an annual option, enable card updater, watch transaction drops and send a short human check-in; ask closing owners for a closure reason so churn stays honest.
- **Sourced:**
  - Churnkey, about 2M exit responses across all SaaS: budget 33.0%, infrequent use 30.6%, expectations not met 8.6%, technical 4.7%, alternatives 4.3% (https://churnkey.co/blog/voluntary-churn-benchmarks/, 2025-12-13)
  - Retail trade 5-year establishment survival 54.2% [unverified, third-party summary of BLS data] (general BLS pattern: https://www.bls.gov/opub/ted/2024/34-7-percent-of-business-establishments-born-in-2013-were-still-operating-in-2023.htm, 2024)
  - Tariff pressure on small shops (Modern Retail, https://www.modernretail.co/operations/its-covid-2-0-mom-and-pop-shops-are-already-feeling-the-squeeze-of-trumps-tariff-wars/, 2025-02-24)
  - Coresight: about 8,200 US store closures in 2025, +12% vs 2024, all retailers not independents [unverified] (https://macaubusiness.com/economic-watch-u-s-retailers-see-8200-closures-in-2025-amid-tariffs-debt-pressures/, 2026)
- **[design]:**
  - Annual logo churn 20-30% on monthly plans, 10-15% on annual prepay [design]
  - Reason mix and involuntary share [design]; no verified SaaS churn figure exists for independent retail
  - Save rates unknown for this segment; generic rates apply

### Independent restaurants and small groups (`restaurants`)

- **Churn:** 15%-30% annual logo churn (evidence: [design]). Involuntary 15.0% of churned logos (notes' prose range 10%-20%).
- **Reasons:** business_closed 24%, payment_failed 15%, switched_competitor 11%, price_too_high 8%, budget_cut 8%, not_using 7%, platform_built_in 5%.
- **Timing:** Mostly monthly. Closures follow lease expiry and slow seasons (Jan-Feb, summer in tourist markets); multi-unit groups churn unit by unit.
- **Leading indicators:** business_volume_decline (30-90 d), failed_payment (0-7 d), closure_news (0-60 d), champion_departure (30-90 d), outage_incident (7-60 d), seat_decline (30-60 d).
- **Saves:** Pause plan (1-3 months, data kept) 25%; Downgrade: fewer seats, units or a cheaper tier 22%; Multi-year term with price lock / cap 40%; Fix the issue, apologise personally, add a credit 35%; Dunning: smart retries plus failed-payment emails 42%.
- **Solo founder:** Build a clean export and fast offboarding, set up retries and card updater, flag a drop in covers with a specific pause or downgrade offer, make location-level billing easy to reduce; skip POS fights without a payments or hardware story.
- **Sourced:**
  - Independent US restaurant locations fell from 422,001 (2024) to 412,498 (end 2025), -2.3%; 42% of operators were not profitable in 2025 (Technomic via Nation's Restaurant News, https://www.nrn.com/independent-restaurants/the-independent-restaurant-sector-shrunk-by-2-3-in-2025, 2026-02-24)
  - Toast: about 164,000 locations at end 2025, 30,000 net adds, SaaS net retention 109% (https://www.businesswire.com/news/home/20260212058106/en/Toast-Announces-Fourth-Quarter-and-Full-Year-2025-Financial-Results, 2026-02-12)
  - Toast churn "slightly above 10%" annualized, mostly smaller restaurants [unverified, analyst Q&A summary] (https://fintool.com/app/research/companies/TOST, undated)
  - First-year restaurant failure 14-30% (NRA) or about 17% (BLS) [unverified, secondary] (https://www.restroworks.com/blog/restaurant-failure-statistics/, 2025)
  - Churnkey: discounts are 62% of cancel-flow offers presented (offer frequency, not a save rate) [unverified] (https://churnkey.co/blog/voluntary-churn-benchmarks/, 2025-12-13)
- **[design]:**
  - Annual logo churn 15-30% [design]
  - Reason mix [design]; location-level downgrade saves groups better than a whole-account discount [design]
  - No verified save rates for restaurant SaaS

### Salons, spas and boutique fitness studios (`salons_fitness`)

- **Churn:** 12%-35% annual logo churn (evidence: [design]). Involuntary 20.0% of churned logos (notes' prose range 15%-25%).
- **Reasons:** payment_failed 20%, price_too_high 14%, switched_competitor 12%, business_closed 10%, champion_left 9%, not_using 7%, bugs_reliability 5%.
- **Timing:** Monthly plus annual contracts. Churn clusters after the January slump and summer slow season; a booth renter or key instructor leaving can take a seat with them in any month.
- **Leading indicators:** business_volume_decline (28-42 d), champion_departure (30-90 d), failed_payment (0-7 d), seat_decline (30-60 d), outage_incident (7-60 d).
- **Saves:** Pause plan (1-3 months, data kept) 25%; Flex pricing: per active project / per unit with parked-unit credit / seat removal 25%; Second champion / multi-threading (finance, ops, users) 30%; Dunning: smart retries plus failed-payment emails 42%.
- **Solo founder:** Let each stylist or instructor see their own bookings so the account survives a departure, offer seat-based pricing and a pause, fix booking and checkout reliability first, build a clean client-data export.
- **Sourced:**
  - Regis averaged about 50 store closures a quarter [unverified] (https://finance.yahoo.com/economy/articles/104-old-national-hair-salon-140700487.html, undated)
  - F45 franchisee Mad Fitness Group filed Chapter 11 in August 2026; Nike Studios closed all locations after about three years [unverified for snippet dates] (https://athletechnews.com/f45-franchisee-mad-fitness-group-files-for-chapter-11-bankruptcy/, 2026)
  - Capterra review: Vagaro added fees and an outage stopped check-in and checkout during business hours [unverified, anecdotal] (https://www.capterra.com/p/153752/Vagaro/reviews/?page=18, 2025)
- **[design]:**
  - Annual logo churn 20-35% monthly plans, 10-15% annual contracts [design]
  - Reason mix [design]; champion_left means the stylist, instructor or studio manager who ran the account
  - Phorest survey: 45% of 1,000 salon owners had considered closing [unverified, undated, likely pre-2025, no URL kept]
  - No published save rates

### Trades and specialty subcontractors (roofing, HVAC, plumbing, electrical) (`trades`)

- **Churn:** 15%-45% annual logo churn (evidence: a disclosed vertical-SaaS proxy plus [design]). Involuntary 20.0% of churned logos (notes' prose range 15%-25%).
- **Reasons:** payment_failed 20%, business_closed 13%, not_using 11%, seasonal_pause 9%, price_too_high 8%, switched_competitor 7%, never_activated 7%.
- **Timing:** Monthly, no notice period. Cancellations cluster in the winter off-season for roofing and cooling work; onboarding failures cluster in the first 90 days; dunning window 1-3 weeks.
- **Leading indicators:** business_volume_decline (14-60 d), usage_drop (14-30 d), failed_payment (0-7 d), seat_decline (30-60 d), season_end (0-30 d), closure_news (0-60 d).
- **Saves:** Pause plan (1-3 months, data kept) 30%; Dunning: smart retries plus failed-payment emails 42%; Card account updater / automatic card updates 20%; Move to annual prepay at a discount 15%; Flex pricing: per active project / per unit with parked-unit credit / seat removal 25%.
- **Solo founder:** Ship a seasonal pause and one-click reactivation first, add dunning and card updater, price per technician, onboard in the first 14 days with a data import.
- **Sourced:**
  - ServiceTitan gross dollar retention above 95% in each of its last 10 quarters, only for customers above $10K annualized billings (S-1, period ended 2024-07-31: https://www.sec.gov/Archives/edgar/data/1638826/000119312524260611/d577298ds1.htm)
  - SaaS Capital: a 95% quarterly figure compounds to about 81.5% annually and ServiceTitan excludes downgrades; 75-80% GRR is strong for small-business software (https://www.saas-capital.com/blog-posts/how-to-have-a-95-gross-revenue-retention-selling-saas-to-small-businesses/, 2024-12-10)
  - Churnkey/Stripe: involuntary is 22% of all SaaS churn, 16% for B2B, 26% for AOV $30-100 and 35% under $10 (https://churnkey.co/blog/involuntary-churn-benchmarks, 2025-11-14, updated 2025-12-12)
  - Optifai 2026 (N=939): SMB SaaS 3-7% monthly, 30-58% annual [unverified] (https://stealthagents.com/research/saas-churn-rate-statistics-2026, 2026)
  - Contractor+ offers account credits for reactivation [unverified] (https://support.contractorplus.app/en/articles/11429067-how-to-cancel-your-contractor-membership)
- **[design]:**
  - Annual logo churn 30-45% monthly plans, 1.5-2.5x lower on annual prepay [design]
  - Seasonal pause converts 20-40% of would-be seasonal cancels [design]
  - Reason mix [design]

### Trucking and logistics fleets (owner-operators to mid-size carriers) (`trucking`)

- **Churn:** 5%-45% annual logo churn (evidence: a disclosed vertical-SaaS proxy plus [design]). Involuntary 20.0% of churned logos (notes' prose range 15%-25%).
- **Reasons:** business_closed 21%, payment_failed 20%, price_too_high 8%, switched_competitor 7%, acquired_or_merged 6%, not_using 5%, consolidated_vendors 5%.
- **Timing:** Follows freight-market cycles, not renewals. Small carriers vanish without notice; mid-size fleets give 60-90 days around a renewal or the end of a ~36-month hardware lease.
- **Leading indicators:** closure_news (0-60 d), seat_decline (14-60 d), usage_drop (7-30 d), regulatory_change (90-365 d), failed_payment (0-7 d), slow_invoice_payment (14-60 d).
- **Saves:** Flex pricing: per active project / per unit with parked-unit credit / seat removal 25%; Multi-year term with price lock / cap 40%; Dunning: smart retries plus failed-payment emails 42%; Downgrade: fewer seats, units or a cheaper tier 22%.
- **Solo founder:** Price per unit with a parked-unit credit, monitor FMCSA authority status for every account (public data), sell to mid-size fleets rather than the one-truck tail, avoid ELD/TMS bundling fights.
- **Sourced:**
  - Motive net dollar retention 109-110% (Core, ARR above $7,500) and 125-126% (Large, above $100K) (S-1, data to 2025-09-30: https://www.sec.gov/Archives/edgar/data/1646681/000162828025058773/motive-sx1.htm; https://tomtunguz.com/motive-s-1/)
  - Samsara FY26 core-customer NRR target about 115% [unverified] (https://www.tipranks.com/news/the-fly/samsara-sees-q1-annual-recurring-revenue-down-from-q4)
  - FreightWaves SONAR: about 838 net revocations a week as of 2026-05-15 (the same article gives both "30% below the 2025 average" and "31% above 2025": conflicting) [unverified] (https://www.freightwaves.com/news/fmcsa-removes-five-elds-warns-fleets-to-switch-by-dec-16, 2026)
  - FMCSA revoked 24 ELDs by mid-2025, the most since 2018 [unverified] (https://www.freightwaves.com/news/fmcsa-pulls-three-more-elds-from-the-approved-list, 2025)
  - Epiq AACER H1 2026: total US filings +12%, commercial Chapter 11 +28% (https://www.abfjournal.com/epiq-total-bankruptcy-filings-increase-12-in-h1-26/, 2026)
- **[design]:**
  - Annual logo churn 25-45% for small carriers, 5-10% for fleets above 50 units [design]
  - Reason mix [design]; regulation_change = forced ELD swap counted as churn for the old vendor

### General contractors and mid-size construction firms (`general_contractors`)

- **Churn:** 10%-25% annual logo churn (evidence: a disclosed vertical-SaaS proxy plus [design]). Involuntary 12.5% of churned logos (notes' prose range 10%-15%).
- **Reasons:** project_completed_no_renewal 13%, payment_failed 13%, switched_competitor 11%, business_closed 11%, consolidated_vendors 9%, acquired_or_merged 7%, champion_left 7%.
- **Timing:** Churn clusters at project completion and calendar/fiscal year-end (software budgets reviewed in Q4 and Q1); 60-90 days notice through procurement; dunning window 1-3 weeks.
- **Leading indicators:** business_volume_decline (30-60 d), champion_departure (30-90 d), acquisition_news (60-180 d), usage_drop (30-60 d), term_end_approaching (90-365 d).
- **Saves:** Flex pricing: per active project / per unit with parked-unit credit / seat removal 25%; Second champion / multi-threading (finance, ops, users) 30%; Founder / executive outreach to the economic buyer or successor 30%; Multi-year term with price lock / cap 40%.
- **Solo founder:** Price per active project, get a second champion in accounting, track project count monthly, skip formal RFPs.
- **Sourced:**
  - Procore FY2025 gross revenue retention 95%, net 106% (preliminary Q4 release, https://www.businesswire.com/news/home/20260212491358/en/, 2026-02-12); a larger multi-module base, so a ceiling for a small GC tool
  - Motive S-1 NDR 109-126% by customer size (https://www.sec.gov/Archives/edgar/data/1646681/000162828025058773/motive-sx1.htm, data to 2025-09-30); net of churn, so it does not isolate churn
  - Construction firm 5-year survival 46.2% (1996-97 founders) vs 59.3% (2016-17) [unverified, BLS-based via eSub] (https://esub.com/blog/construction-business-software)
  - Autodesk reseller says cost and workflow fit drive Procore to ACC moves [unverified, promotional] (https://resources.imaginit.com/building-solutions-blog/why-organizations-are-switching-from-procore-to-autodesk-construction-cloud-acc)
- **[design]:**
  - Annual logo churn 15-25% (range widened to 10% to include Procore-style larger accounts); monthly plans 2-4% a month [design]
  - Reason mix [design]; project_completed_no_renewal is segment-specific

### Independent dental, medical and veterinary practices (and DSO sites) (`health_practices`)

- **Churn:** 12%-20% annual logo churn (evidence: a disclosed vertical-SaaS proxy plus [design]). Involuntary 20.0% of churned logos (notes' prose range 15%-25%).
- **Reasons:** payment_failed 20%, acquired_or_merged 16%, business_closed 11%, switched_competitor 9%, price_too_high 8%, owner_retired_or_sold 7%, champion_left 7%.
- **Timing:** Voluntary churn clusters at the annual renewal date and in the first 90 days after go-live; acquisitions close 60-120 days after the first signal and the group may give 30-90 days notice; involuntary at card expiry.
- **Leading indicators:** acquisition_news (60-120 d), champion_departure (30-90 d), usage_drop (30-60 d), failed_payment (0-7 d), support_ticket_spike (14-45 d).
- **Saves:** Reach the buyer / new owner before their tech plan is fixed 25%; Downgrade: fewer seats, units or a cheaper tier 20%; Pause plan (1-3 months, data kept) 25%; Dunning: smart retries plus failed-payment emails 42%.
- **Solo founder:** Watch the owner and local DSO or vet-group news and call before the close date, offer an acquired-practice contract the buyer can adopt, build dunning first, offer a pause for seasonal clinics, export data cleanly.
- **Sourced:**
  - Weave: dollar-based net retention 93% and gross retention 89% at 2025-12-31; Q3 2025 GRR 90% vs 92% a year earlier (https://www.businesswire.com/news/home/20260218591820/en/Weave-Announces-Fourth-Quarter-and-Full-Year-2025-Financial-Results/, 2026-02-18; Q3 detail via https://fintool.com/app/research/companies/WEAV/earnings/Q3%202025 [secondary])
  - About 13% of US dentists are DSO-affiliated (ADA HPI via Becker's, https://www.beckersdental.com/dentists/41051-13-of-dentists-are-affiliated-with-dsos-7-things-to-know.html, undated); more than 1 in 4 dentists within 10 years of school in 2024 (https://adanews.ada.org/new-dentist/2025/november/hpi-more-new-dentists-affiliated-with-dsos/, 2025-11)
  - 25% to nearly 50% of US vet practices are corporate-owned, definitions differ (https://www.economicliberties.us/our-work/the-save-our-pets-act-stopping-the-corporate-takeover-of-veterinary-practices/, 2025-05; https://www.frontiersin.org/journals/veterinary-science/articles/10.3389/fvets.2025.1558745/full, 2025)
  - A DSO merged 67 acquired practices onto its practice-management system (https://www.beckersdental.com/dso-dpms/pennsylvania-dso-merges-67-acquired-practices-to-practice-management-system/, undated)
  - Churnkey: insufficient funds 40.5% of about 5M failed subscription payments [unverified] (https://churnkey.co/blog/involuntary-churn-benchmarks); champion departure then 51% churn within 12 months [unverified] (https://research.stripo.email/enterprise-saas-churn-rate-benchmarks-2026, 2026-06)
- **[design]:**
  - Annual logo churn 12-20% (2-4% a month on monthly plans); revenue churn 3-6 points lower [design]
  - Reason mix [design]; Weave GRR 89% implies about 11% gross revenue loss, consistent with the range
  - Pause/downgrade retains 15-25% of at-risk accounts; dunning recovers 30-50% of failed payments [design]

### Hospitals and health systems (`hospitals`)

- **Churn:** 3%-6% annual logo churn (evidence: [design]). Involuntary 2.0% of churned logos (notes' prose range 1%-3%).
- **Reasons:** contract_term_end_rfp 22%, consolidated_vendors 18%, acquired_or_merged 14%, champion_left 12%, budget_cut 10%, switched_competitor 6%, missing_feature 5%.
- **Timing:** Rare mid-contract; concentrated at term end and in the 60-120 days before it when an RFP is issued. Budget decisions land at fiscal-year start (often July 1 or October 1). Merger rationalisation lags 12-24 months.
- **Leading indicators:** rfp_posted (90-180 d), term_end_approaching (180-365 d), exec_sponsor_change (60-120 d), acquisition_news (60-180 d), seat_decline (30-60 d), budget_review (60-120 d).
- **Saves:** Early extension / renewal with capped increase, offered before a rebid 50%; Founder / executive outreach to the economic buyer or successor 30%; Second champion / multi-threading (finance, ops, users) 30%; Ship the compliance package (SOC 2, BAA, VPAT/HECVAT, validation docs) 45%.
- **Solo founder:** Sell into a department not the enterprise, keep an exec-sponsor map and the term-end calendar, offer a short fixed-scope renewal that fits an existing budget line, name two users hurt by a switch, finish BAA and security paperwork early.
- **Sourced:**
  - KLAS: deep adopters consolidated RCM suites for "vendor consolidation" and "stronger vendor relationship" (each 57%), pricing 43% (https://healthsystemcio.com/2026/07/21/rcm-suite-consolidation-partnership/, 2026-07-21)
  - Hospitals making new EHR decisions fell 40% in 2025 vs 2024 and 50% vs 2023; only two systems with 10+ hospitals made enterprise EHR decisions, both Epic [snippet only, page returned 403] (https://www.beckershospitalreview.com/healthcare-information-technology/ehrs/are-big-health-systems-done-switching-ehrs/)
  - Chartis 2025: 46% of rural hospitals operating at a loss, 432 vulnerable to closure (https://www.fiercehealthcare.com/providers/46-rural-hospitals-red-432-vulnerable-closure-report-finds, 2025-02)
  - Federal Medicaid cuts about $911B over a decade, most impact 2027 and later (Capstone, https://capstonedc.com/wp-content/uploads/2025/12/Provider-2026-Preview-Web.pdf, 2025-12); $80B provider revenue loss in 2026 is a projection [unverified] (Becker's)
  - Champion departure then 51% churn within 12 months, executive sponsor departure 65% [unverified vendor report] (https://research.stripo.email/enterprise-saas-churn-rate-benchmarks-2026, 2026-06)
- **[design]:**
  - Annual logo churn 3-6%, revenue churn 2-5% [design]
  - Reason mix [design]; involuntary 1-3% (invoice and PO) [design]
  - No public save rates for health-system software

### Pharma, biotech and life-sciences companies (GxP) (`pharma`)

- **Churn:** 3%-25% annual logo churn (evidence: [design]). Involuntary 2.0% of churned logos (notes' prose range 0%-3%).
- **Reasons:** business_closed 22%, budget_cut 15%, acquired_or_merged 14%, funding_ended 10%, consolidated_vendors 9%, contract_term_end_rfp 8%, switched_competitor 7%.
- **Timing:** Biotech churn is a sudden event (shutdown notice, asset sale) with 30 days or less notice; pharma churn follows multi-year platform migrations with 12-36 months notice; budgets set on the calendar year.
- **Leading indicators:** funding_cliff (60-270 d), layoffs_or_freeze (30-120 d), champion_departure (30-90 d), acquisition_news (60-180 d), usage_drop (30-60 d).
- **Saves:** Downgrade: fewer seats, units or a cheaper tier 22%; Multi-year term with price lock / cap 40%; Ship the compliance package (SOC 2, BAA, VPAT/HECVAT, validation docs) 45%; Pause plan (1-3 months, data kept) 25%.
- **Solo founder:** Cap any single biotech at a small share of ARR, push annual prepay, watch the funding calendar and offer a smaller plan after a restructuring, target niches the big platforms serve poorly, build the validation package early.
- **Sourced:**
  - About 42,700 biopharma employees affected by cuts in 2025, +47.1% YoY (https://www.biospace.com/job-trends/biopharmas-axed-47-more-employees-year-over-year, 2025)
  - Fierce Biotech graveyard: 19 biotech closures in 2025, 22 in 2024, a record 27 in 2023 (https://www.fiercebiotech.com/special-reports/2025-biotech-graveyard, late 2025 or Jan 2026)
  - 17 biopharma layoff announcements Apr-Jun 2026 vs 64 in Q2 2025 (https://www.fiercebiotech.com/biotech/biotechs-better-position-avoid-workforce-reductions-layoffs-continue-drop-q226, Q2 2026)
  - Veeva separated from Salesforce Sept 2025, customers have a transition window to 2030; Salesforce claims 40+ pharma clients on Life Sciences Cloud (self-reported) (https://intuitionlabs.ai/articles/veeva-vault-crm-migration-roadmap, 2025); Veeva claims nine committed top-20 CRM customers (self-reported, https://www.nasdaq.com/articles/veeva-systems-lifts-outlook-crm-wins)
  - Benchling cut 9% of staff (https://www.clinicaltrialsarena.com/news/life-sciences-software-company-benchling-trims-workforce-by-9/)
- **[design]:**
  - Annual logo churn 15-25% for small and mid biotechs, 3-8% for large pharma [design]
  - Reason mix [design]; involuntary under 3% (invoice) [design]
  - No public save rates for life-sciences software

### Law firms (solo and small through AmLaw 200) (`law_firms`)

- **Churn:** 12%-20% annual logo churn (evidence: [design]). Involuntary 12.5% of churned logos (notes' prose range 10%-15%).
- **Reasons:** switched_competitor 16%, price_too_high 13%, payment_failed 13%, not_using 11%, champion_left 9%, missing_feature 7%, acquired_or_merged 7%.
- **Timing:** Annual renewal and calendar year-end budget planning. Annual plans give no notice; monthly plans about 30 days. Data migration from the prior system is the main onboarding failure in the first 90 days.
- **Leading indicators:** seat_decline (30-60 d), usage_drop (30-60 d), champion_departure (30-90 d), failed_payment (0-7 d), owner_succession (90-365 d).
- **Saves:** Move to annual prepay at a discount 15%; Downgrade: fewer seats, units or a cheaper tier 22%; Onboarding rescue: call, data import, setup help in first 14 days 25%; Activated integration with their core stack 25%.
- **Solo founder:** Pick one practice niche with real switching cost, build the integration it needs, make export and cancellation self-serve, track seat counts weekly, run a short exit survey on every cancellation.
- **Sourced:**
  - Churnkey State of Retention 2025: voluntary about 7% a month, involuntary about 1% a month on average across its (unsegmented) dataset, yet it also says involuntary "can easily comprise 40%" of churn: the two statements do not match (https://churnkey.co/reports/state-of-retention-2025, data year 2024, page updated 2026-09-11)
  - Clio reports more than US$500M ARR and discloses no churn (https://www.clio.com/?p=56400, 2025-2026); third-party Clio SMB retention of about 96% is from low-quality sites [unverified]
  - ABA 2025: 73% of firms use cloud legal tools (https://www.americanbar.org/news/abanews/aba-news-archives/2025/03/aba-releases-survey-tech-trends/, 2025-03)
  - Capterra review: moved away from PracticePanther mainly because cancelling required a support call (https://www.capterra.com/p/140231/PracticePanther-Legal-Software/reviews/?page=10, undated); Dewey B Strategic survey (n=87) cited high cost and low usage (https://www.deweybstrategic.com/?p=7889, 2020) [unverified]
- **[design]:**
  - Annual logo churn 12-20%, revenue churn 8-12%, monthly plans 2-3x annual [design]
  - Reason mix [design]; cancellation friction distorts stated reasons, so treat switched and price as floors

### Accounting and CPA firms (`accounting_firms`)

- **Churn:** 8%-15% annual logo churn (evidence: [design]). Involuntary 10.0% of churned logos (notes' prose range 8%-12%).
- **Reasons:** not_using 13%, price_too_high 13%, switched_competitor 13%, payment_failed 10%, poor_support 9%, consolidated_vendors 7%, business_closed 7%.
- **Timing:** Two decision windows: May-June (season review, preparers have left) and September-December (budget for next season). Largest drop in seats and logins May-August. Notice is short; many cancel by email at renewal.
- **Leading indicators:** usage_drop (30-90 d), seat_decline (30-60 d), champion_departure (30-90 d), support_silence (30-60 d), competitor_pitch (14-90 d), season_end (0-30 d).
- **Saves:** Pause plan (1-3 months, data kept) 30%; Move to annual prepay at a discount 15%; Onboarding rescue: call, data import, setup help in first 14 days 25%; Fix the issue, apologise personally, add a credit 35%; Second champion / multi-threading (finance, ops, users) 30%.
- **Solo founder:** Offer an off-season plan with a fixed reactivation date, freeze releases mid-January to mid-April, email the owner before the September renewal, watch June-July logins, reach the preparers as well as the owner.
- **Sourced:**
  - CPA firms patch post-season breakage; sponsored item cites crashes and remote-access failures at small firms (https://www.cpapracticeadvisor.com/2026/02/24/what-cpa-firms-miss-when-preparing-for-tax-season/178747/, 2026-02-24)
  - AICPA 2025 National MAP Survey (released 2025-11) is the place to look for firm-level retention; figures not retrieved (https://www.aicpa-cima.com/resources/article/key-small-firm-insights-in-the-2025-national-map-survey)
- **[design]:**
  - Annual logo churn 8-15% for firm-level software, 25-35% for monthly client-portal tools [design]
  - Dormant off-season plan at about 30-50% of list price [design]
  - TaxDome cites 98% client retention on a third-party comparison page, no methodology [unverified]; a TaxDome-sponsored claim that 90% of switching clients cannot get answers [unverified, origin not traced]
  - Reason mix [design]

### Real estate agents and brokerages (`real_estate`)

- **Churn:** 15%-60% annual logo churn (evidence: [design]). Involuntary 5.0% of churned logos (notes' prose range 5%-10%).
- **Reasons:** champion_left 14%, budget_cut 12%, not_using 12%, business_closed 10%, platform_built_in 10%, switched_competitor 10%, price_too_high 8%.
- **Timing:** Brokerage contracts commonly start and end in January; agent exits cluster around licence renewal dates and the slow winter months. Notice is usually none: agents stop paying and disappear.
- **Leading indicators:** business_volume_decline (60-180 d), champion_departure (30-90 d), failed_payment (0-7 d), platform_announcement (30-180 d), usage_drop (30-60 d).
- **Saves:** Pause plan (1-3 months, data kept) 25%; Downgrade: fewer seats, units or a cheaper tier 22%; Multi-site / group master agreement 25%; Activated integration with their core stack 25%.
- **Solo founder:** Sell to team leaders or brokerages rather than individual agents, make the product survive a team leader leaving, watch transaction volume, record the agent's brokerage so a move is an event not a silent loss.
- **Sourced:**
  - Recruiting Insight / Lone Wolf: 6.8% of productive agents changed in 2025 (6.0% in 2024), external moves 5.5% (https://www.housingwire.com/articles/agent-migration-2025-trends/, 2026)
  - Courted: about 16% of agents (roughly 230,000) changed brokerages in 2025, stable at 16-18% since 2020 (https://www.housingwire.com/articles/agent-churn-2025-courted/, 2026); the two measures differ in definition (productive agents vs all agents)
  - Cotality/ResiClub survey (213 agents, Feb-Mar 2026): 92% plan to stay active at least three more years (https://www.resiclubanalytics.com/p/resale-turnover-4-decade-low-real-estate-agents-survey-cotality-resiclub, 2026)
  - iPro Realty (Ontario, about 2,400 agents) ordered closed by RECO effective 2025-08-19 after a trust-account shortfall (https://reco.on.ca/news/update-for-consumers-and-agents-ipro-closure)
  - NAR membership -1.7% "in the year to June 2026" [unverified; the cited Inman article is dated 2026-03-30, so the period cannot be right] (https://www.inman.com/2026/03/30/agent-commissions-show-stickiness-nearly-2-years-after-nar-settlement/)
- **[design]:**
  - Per-agent seat tools: 5-8% monthly, 40-60% annual logo churn; per-brokerage tools 15-25% [design]
  - Brokerage-paid tools churn when the agent changes brokerage (about 16% a year)
  - agent_exit_industry in the notes split 10 business_closed / 6 owner_retired_or_sold

### Marketing and creative agencies (`agencies`)

- **Churn:** 20%-35% annual logo churn (evidence: [design]). Involuntary 3.1% of churned logos (notes' prose range 3%-8%).
- **Reasons:** budget_cut 21%, not_using 14%, champion_left 12%, switched_competitor 12%, price_too_high 8%, missing_feature 6%, consolidated_vendors 6%.
- **Timing:** Client losses are decided at annual budget cycles (Q4 planning, Q1 reset) and after pitches; the agency's SaaS cancellation follows the client loss by 1-2 quarters.
- **Leading indicators:** business_volume_decline (60-180 d), seat_decline (30-60 d), champion_departure (30-90 d), layoffs_or_freeze (30-120 d), slow_invoice_payment (14-60 d).
- **Saves:** Flex pricing: per active project / per unit with parked-unit credit / seat removal 25%; Pause plan (1-3 months, data kept) 25%; Activated integration with their core stack 25%; Downgrade: fewer seats, units or a cheaper tier 22%.
- **Solo founder:** Sell to retainer agencies, price so seats can scale down, build the monthly client report, watch client count and seat count together, survey agencies within 30 days of a client loss.
- **Sourced:**
  - Gartner CMO Spend Survey (Feb-Mar 2025, n=402): budgets flat at 7.7% of revenue, 39% plan to cut agency budgets, 22% say generative AI reduced their need for outside creative (https://www.businesswire.com/news/home/20250512782208/en, 2025-05-12)
  - Focus Digital: annual client churn about 33% performance, 28% hybrid, 18% retainer [unverified; year unclear] (https://focus-digital.co/average-churn-rate-by-industry-saas/)
  - Setup 6th Annual Marketing Relationship Survey (400+ respondents): clients leave over what the agency did; agencies think it is what happened to the client [unverified secondary] (https://everything-pr.com/the-cmo-agency-trust-gap-2026-why-clients-leave-and-why-agencies-dont-see-it-coming, 2026)
  - Vendasta 2023 via Duda: most agencies see 2-8% churn, period not stated [unverified] (https://blog.duda.co/warning-signs-your-smb-client-might-churn-and-how-to-keep-them)
  - vcita SMB survey of 500 (https://www.vcita.com/press/smb-survey-highlights-marketing-agency-churn, 2025-04)
- **[design]:**
  - Annual logo churn 20-35%, higher for project-billed agencies [design]
  - Reason mix [design]: the note's table sums to 97, normalised here

### E-commerce and DTC brands (Shopify ecosystem) (`ecommerce`)

- **Churn:** 25%-45% annual logo churn (evidence: [design]). Involuntary 15.0% of churned logos (notes' prose range 8%-30%).
- **Reasons:** not_using 20%, payment_failed 15%, switched_competitor 11%, business_closed 11%, platform_built_in 9%, price_too_high 9%, missing_feature 7%.
- **Timing:** Continuous with a steep early-life spike (testing many apps); uninstall is a single event with no lead time; scheduled store cancellation auto-uninstalls every app.
- **Leading indicators:** plan_downgrade (7-45 d), business_volume_decline (30-60 d), never_activated_7d (0-30 d), platform_announcement (30-180 d), login_decay (14-30 d).
- **Saves:** Onboarding rescue: call, data import, setup help in first 14 days 25%; Pause plan (1-3 months, data kept) 25%; Downgrade: fewer seats, units or a cheaper tier 22%; Cancel-flow survey with one tailored offer 20%.
- **Solo founder:** Capture the uninstall reason with a one-click survey, track activation (first key action within 7 days) before adding features, check Shopify's native-feature announcements each Edition, move toward multi-store plans.
- **Sourced:**
  - Recurly (July 2026 data) ecommerce total 4.25%, voluntary 2.87%, involuntary 1.38%, period unit not stated [unverified] (https://www.recurly.com/research/churn-rate-benchmarks, accessed 2026-10-14)
  - About 14% of merchants uninstall a Shopify app within 24 hours and about 35% remain at day 90 [unverified vendor blog] (https://marmeto.com/blogs/news/shopify-app-uninstalls)
  - Shopify changed uninstall reasons in April 2026; one developer saw 98% of answers as "testing multiple apps" (https://shopify.dev/changelog/update-to-app-uninstall-reasons, 2026)
  - Scheduled store cancellation auto-uninstalls all third-party apps; filter these out [unverified] (https://community.shopify.dev/t/new-uninstall-reason-scheduled-cancellation/33033)
  - Shopify Editions 2025 added native features (cart discount codes, Google Ads from the dashboard): vendor marketing claims, no merchant churn data (https://ecommercepartners.com/2025/05/22/top-5-shopify-editions-summer-25-features-every-ecommerce-manager-should-know-and-what-to-ask-your-dev-agency/, 2025-05-22)
- **[design]:**
  - Annual logo churn 25-45% is a synthesis estimate: the note gave no annual figure [design]
  - Reason mix [design]; involuntary set to 15% as a compromise between the note's table (8%) and the Recurly-derived 32% share
  - earlyLifeMult 4 from the unverified 14%-in-24h / 35%-at-day-90 figures

### Startups and tech SMBs (10-100 employees, PLG and self-serve) (`startup_smb`)

- **Churn:** 12%-30% annual logo churn (evidence: [design]). Involuntary 9.0% of churned logos (notes' prose range 9%-33%).
- **Reasons:** not_using 20%, budget_cut 15%, consolidated_vendors 11%, switched_competitor 9%, payment_failed 9%, outgrew_product 7%, business_closed 6%.
- **Timing:** Self-serve monthly or annual; voluntary churn peaks at annual renewal and in the first 90 days; budget moves at quarter start and after funding rounds close; dunning runs 2-4 weeks.
- **Leading indicators:** layoffs_or_freeze (30-120 d), usage_drop (14-30 d), seat_decline (30-60 d), exec_sponsor_change (60-120 d), funding_cliff (60-270 d), support_silence (30-60 d).
- **Saves:** Pause plan (1-3 months, data kept) 25%; Downgrade: fewer seats, units or a cheaper tier 22%; Move to annual prepay at a discount 15%; Dunning: smart retries plus failed-payment emails 42%.
- **Solo founder:** Build a usage-decline alert (no key action in 14 days) and reach out before renewal, add pause and downgrade paths, offer annual prepay, depend on your data or workflow not generic text generation, fix dunning.
- **Sourced:**
  - Carta recorded 966 closures among its US customers in 2024, up from 769 in 2023 (https://techcrunch.com/2025/01/26/2025-will-likely-be-another-brutal-year-of-failed-startups-data-suggests, 2025-01-26)
  - Software Finder survey (1,008 US professionals): 38% of firms canceled or downgraded legacy SaaS in 2025, 21% replaced legacy tools with AI-native ones [unverified; firm-wide] (https://www.marketingprofs.com/chirp/2025/53966/how-saas-solution-preferences-are-evolving-infographic, 2025)
  - Retool 2026 Build vs Buy: 35% of teams replaced at least one SaaS tool with a custom build [unverified, vendor] (https://www.businesswire.com/news/home/20260217548274/en/, 2026-02-17)
  - Zylo 2025 SaaS Management Index: $4,830 spend per employee, +21.9% YoY (https://zylo.com/news/2025-saas-management-index, 2025-01)
  - SMB annual logo churn 10-14% (ChartMogul 2025) and 14-22% for ACV under $5K (Paddle/ProfitWell) [unverified, secondary] (https://userjot.com/blog/saas-churn-rate-benchmarks); CB Insights: 70% of 431 venture-backed shutdowns ran out of capital [unverified, secondhand]
- **[design]:**
  - Annual logo churn 12-30% synthesis range from conflicting secondary sources [design]
  - Reason mix [design]; business_closed / funding_ended row (12%) split 6/6
  - Pause or downgrade saves more than discounts because low adoption is the top reason [design]

### Mid-market companies (100-1,000 employees) (`mid_market`)

- **Churn:** 6%-15% annual logo churn (evidence: [design]). Involuntary 7.0% of churned logos (notes' prose range 5%-10%).
- **Reasons:** consolidated_vendors 17%, budget_cut 13%, champion_left 12%, switched_competitor 10%, acquired_or_merged 8%, not_using 8%, payment_failed 7%.
- **Timing:** Churn clusters at the renewal date and the 60-90 days before it; fiscal-year end (often December or June) and Q3-Q4 budget planning are the peak windows for consolidation decisions; without a champion the vendor often gets no notice.
- **Leading indicators:** champion_departure (30-90 d), exec_sponsor_change (60-120 d), seat_decline (30-60 d), slow_invoice_payment (14-60 d), support_ticket_spike (14-45 d), budget_review (60-90 d).
- **Saves:** Founder / executive outreach to the economic buyer or successor 33%; Usage report and user survey before renewal 40%; Multi-year term with price lock / cap 40%; Activated integration with their core stack 25%.
- **Solo founder:** Keep two contacts per account, run a QBR 90 days before each renewal, track seats and logins monthly with a red-flag rule, offer multi-year with a price cap instead of discounts, avoid RFPs unless the deal justifies them.
- **Sourced:**
  - Annual logo churn 6-15%, 7-12% called healthy [unverified, secondary blogs] (https://meltingspot.io/en/blog/saas-b2b-churn-rate-benchmark)
  - ChurnZero: about 51% chance of churn within 12 months after a champion leaves, 65% of accounts with an executive change do not renew; executive outreach within 48 hours makes renewal 33% more likely [unverified, secondhand] (https://churnzero.com/blog/customer-churn-risks-2025-monsters)
  - Torii 2026: firms with 1,500-4,999 employees average 101 tools, spend +8% [unverified; primary report not retrieved] (https://www.cloudmagazin.com/en/2026/02/25/saas-consolidation-how-cios-are-taming-the-tool-jungle/, 2026-02-25)
  - Zylo 2025 SaaS Management Index: spend per employee +21.9% YoY, app count flat (https://zylo.com/news/2025-saas-management-index, 2025-01)
- **[design]:**
  - Involuntary 5-10% (invoiced annual contracts) [design]
  - Reason mix [design]
  - QBR 90 days before renewal is the main consolidation defence; save rate unknown

### Fortune 500 and large enterprise (`enterprise`)

- **Churn:** 2%-5% annual logo churn (evidence: [design]). Involuntary 1.0% of churned logos (notes' prose range 0%-2%).
- **Reasons:** contract_term_end_rfp 22%, consolidated_vendors 20%, budget_cut 15%, acquired_or_merged 10%, champion_left 8%, switched_competitor 8%, moved_to_in_house 5%.
- **Timing:** Decided at the renewal date and the RFP award, which often falls 3-9 months before term end; fiscal-year ends are budget lock points; 90-180 days notice in most large contracts.
- **Leading indicators:** rfp_posted (180-365 d), exec_sponsor_change (60-120 d), acquisition_news (60-180 d), budget_review (90-270 d), seat_decline (30-60 d).
- **Saves:** Early extension / renewal with capped increase, offered before a rebid 50%; Multi-year term with price lock / cap 40%; Activated integration with their core stack 25%; Respond to an open RFP as incumbent 22%.
- **Solo founder:** Avoid Fortune 500 direct sales unless you can pass security review (SOC 2 Type II, SSO, DPA); for existing accounts track renewal date, RFP calendar and M&A news and start renewal talks 6 months early; sell via a partner or a business unit below the procurement threshold.
- **Sourced:**
  - Enterprise annual logo churn 2-5% (ChartMogul 2025 via a secondary blog) and 3.2% above $50K ACV [unverified] (https://userjot.com/blog/saas-churn-rate-benchmarks)
  - Vendr (15,817 transactions, Jan 2024 to Mar 2026): median renewal price -8% ($27K to $24K), median new-deal size -43% ($11K to $6K) [unverified: gated, from the summary; a "2025" report with data to Mar 2026] (https://www.vendr.com/resources/trends-report)
  - Flexera citing BetterCloud: enterprises cut SaaS applications by 18% in 2025 and 82% are consolidating vendors [unverified] (https://www.flexera.com/solutions/financial-services, 2025)
  - CloudBolt survey (2026-01, n=302, 1,000+ employee firms): 4% fully replaced VMware, 86% reducing use, 59% saw 25-49% price increases [unverified; vendor sells migration tools] (https://www.channelinsider.com/infrastructure/cloudbolt-vmware-survey-reducing-usage/)
  - ServiceTitan GDR above 95% is a trades figure, not Fortune 500 (https://www.sec.gov/Archives/edgar/data/1638826/000119312524260611/d577298ds1.htm, S-1 period ended 2024-07-31)
- **[design]:**
  - Revenue churn below logo churn because large accounts stay; involuntary near zero (AP invoices) [design]
  - Reason mix [design]
  - No save-rate data for F500 renewals

### Hotels and hospitality groups (`hotels`)

- **Churn:** 15%-25% annual logo churn (evidence: [design]). Involuntary 5.0% of churned logos (notes' prose range 3%-6%).
- **Reasons:** acquired_or_merged 18%, franchisor_mandated_switch 16%, champion_left 14%, management_change 12%, switched_competitor 10%, not_using 8%, missing_feature 7%.
- **Timing:** Follows the management agreement term (often 5-15 years) or a sale closing; more churn after the summer peak and in January; the new owner or manager often gives 30 days or less.
- **Leading indicators:** acquisition_news (60-180 d), brand_mandate (180-540 d), champion_departure (30-90 d), usage_drop (14-45 d), outage_incident (7-60 d).
- **Saves:** Reach the buyer / new owner before their tech plan is fixed 50%; Multi-site / group master agreement 25%; Get on the franchisor / brand approved-vendor list 40%; Activated integration with their core stack 25%.
- **Solo founder:** Sell to the owner or asset manager and map the management company and brand flag per property, review management-agreement expiry and sale news quarterly, make export and migration painless.
- **Sourced:**
  - Service Properties Trust's 2025 sale of managed Sonesta hotels to franchise partners (113 or 114 properties, reports differ) [unverified] (https://asianhospitality.com/sonesta-to-franchise-114-managed-properties-following-svc-sale, 2025)
  - Braemar converted the Sofitel Chicago Magnificent Mile to a franchise agreement in April 2025, same operator (https://www.sec.gov/Archives/edgar/data/1574085/000157408525000029/bhr-20250403.htm, 2025-04-03)
  - Hilton Durban left the Hilton portfolio after the owner ended the management agreement (https://themercury.co.za/business/2026-02-10-hilton-hotel-in-durban-no-longer-part-of-hilton-portfolio, 2026-02-10)
  - Hotel management agreements run 5-15 years; termination fee often a multiple of prior-12-month gross revenue [unverified] (https://www.mishcon.com/news/hospitality-matters-hotel-agreements)
  - 2026 Hotel Tech Report: 48% of hotels would switch PMS vendors over reliability, 42% over cybersecurity [unverified] (https://hoteltechreport.com/news/2026-hotel-pms-report, 2026)
- **[design]:**
  - Annual logo churn 15-25%, revenue churn 10-18% [design]
  - Reason mix [design]; the note's "platform_built_in / brand-mandated" row (16%) is mapped to franchisor_mandated_switch
  - Pre-sale return figure to the new owner saves 40-60% of acquisition-driven losses [design]

### Franchise systems (franchisors and franchisees) (`franchise_systems`)

- **Churn:** 10%-20% annual logo churn (evidence: [design]). Involuntary 3.0% of churned logos (notes' prose range 2%-5%).
- **Reasons:** business_closed 22%, franchisor_mandated_switch 20%, owner_retired_or_sold 12%, platform_built_in 10%, consolidated_vendors 8%, budget_cut 7%, not_using 6%.
- **Timing:** Mandated switches arrive with a franchisor deadline of 6-18 months at the franchisee's expense; closures at lease end or after a bad year (a unit closes with 1-4 weeks notice and no formal cancellation).
- **Leading indicators:** brand_mandate (180-540 d), closure_news (0-60 d), usage_drop (30-60 d), acquisition_news (60-180 d), failed_payment (0-7 d).
- **Saves:** Get on the franchisor / brand approved-vendor list 40%; Temporary discount 15%; Pause plan (1-3 months, data kept) 25%; Downgrade: fewer seats, units or a cheaper tier 22%.
- **Solo founder:** Get on the franchisor's approved-vendor list before a mandate, price the franchisee tier low enough for a bad quarter, track FDD Item 20 yearly, expect a mandate to be binary.
- **Sourced:**
  - Median annual franchised-outlet closure rate 3.2% across 1,446 brands [unverified aggregator] (https://www.webtonic.io/blog/franchise-lifecycle-and-retention-marketing-statistics, 2026)
  - Dickey's closed 97 franchised units and opened 12 in fiscal 2024 [unverified; the cited QSR URL slug says 85] (https://www.qsrmagazine.com/story/dickeys-barbecue-closes-85-u-s-franchised-restaurants/, 2025)
  - Subway closed at least 729 stores; several franchisee bankruptcies [unverified] (https://finance.yahoo.com/markets/stocks/articles/subway-closed-least-729-stores-105300180.html, 2026)
  - Franchisors can mandate prescribed technology if disclosed in the FDD [unverified] (https://cfa.ca/start-me-up-considerations-for-franchisors-when-mandating-the-use-of-software-by-franchisees/, 2025-03; https://www.heritagelawwi.com/force-franchisee-to-buy-specific-pos-system); closures and terminations are reported in FDD Item 20 [unverified] (https://afranchisecoach.com/glossaries/item-20/)
- **[design]:**
  - Annual logo churn 10-20%, revenue churn 8-15% [design]
  - Reason mix [design]
  - Approved-vendor listing: 30-50% of mandated switches where already listed [design]

### Banks, credit unions and financial services (`banks`)

- **Churn:** 6%-10% annual logo churn (evidence: [design]). Involuntary 3.0% of churned logos (notes' prose range 2%-5%).
- **Reasons:** acquired_or_merged 21%, consolidated_vendors 14%, contract_term_end_rfp 12%, switched_competitor 10%, champion_left 8%, budget_cut 7%, missing_feature 6%.
- **Timing:** Annual or 3-5 year contracts; churn clusters at contract end and at merger close (6-12 months after announcement). An acquirer can order exits with little notice (90-180 days when the FI controls the decision). Termination fees scale with remaining term.
- **Leading indicators:** acquisition_news (90-365 d), champion_departure (30-90 d), seat_decline (30-60 d), rfp_posted (180-365 d), exec_sponsor_change (60-120 d).
- **Saves:** Reach the buyer / new owner before their tech plan is fixed 27%; Activated integration with their core stack 25%; Multi-year term with price lock / cap 40%; Flex pricing: per active project / per unit with parked-unit credit / seat removal 25%.
- **Solo founder:** Watch 8-K and S-4 filings and reach the acquirer's new CIO before the close, integrate with the common core processors, put change-of-control and data-export terms in every contract, avoid large FI deals.
- **Sourced:**
  - ABA 2024 Core Platforms Survey: 69% of bankers likely to stay with their core at renewal, 19% likely to switch; satisfaction falls the longer a contract runs, to 41% within two years of renewal (https://bankingjournal.aba.com/2025/07/aba-survey-most-banks-likely-to-stick-with-current-core-provider/, 2025-07-02)
  - Community bank sellers completed 127 mergers in 2025, the most since 2021 [from search summary; PDF did not parse] (https://www.kansascityfed.org/documents/14360/Community_Banking_Bulletin_Highlight_-_Jan_2026_-_MA_U7KPMwX.pdf, 2026-01)
  - 157 credit union mergers in 2025 with $45B merged assets [unverified podcast transcript] (https://withflyingcolors.transistor.fm/348, 2026); federally insured CU count 4,455 to 4,287 during 2025 [unverified] (https://walnutinvest.com/stats/credit-union-statistics, 2026)
  - Termination fees scale with remaining term, so exits cluster at term end (American Banker https://www.americanbanker.com/news/tech-contracts-creating-tangle-of-troubles-in-m-amp-a-deals, undated; Barclay Damon https://barclaydamon.com/news/credit-union-times-breaking-free-strategies-for-credit-unions-to-navigate-vendor-terminations, 2024-08)
  - Cross-industry B2B SaaS churn 3.5% (2.6% voluntary, 0.8% involuntary) per Recurly 2025 via Vitally [unverified] (https://www.vitally.io/post/saas-churn-benchmarks, 2025-04-23)
- **[design]:**
  - Annual logo churn 6-10%, revenue churn 4-7% [design]
  - Reason mix [design]; save rate 20-35% if reached pre-close, under 10% after the acquirer decides [design]

### Insurance agencies and carriers (`insurance`)

- **Churn:** 2%-10% annual logo churn (evidence: [design]). Involuntary 4.0% of churned logos (notes' prose range 3%-5%).
- **Reasons:** acquired_or_merged 29%, consolidated_vendors 15%, owner_retired_or_sold 12%, champion_left 10%, switched_competitor 9%, missing_feature 6%, budget_cut 5%.
- **Timing:** Acquired agencies often churn at close or at the first AMS renewal after close; retention earnouts (1-3 years) can hold the old system until the earnout ends; notice is usually none because the acquirer decides.
- **Leading indicators:** acquisition_news (60-365 d), owner_succession (90-365 d), champion_departure (30-90 d), business_volume_decline (30-90 d), seat_decline (30-60 d).
- **Saves:** Reach the buyer / new owner before their tech plan is fixed 20%; Second champion / multi-threading (finance, ops, users) 30%; Flex pricing: per active project / per unit with parked-unit credit / seat removal 25%; Multi-site / group master agreement 25%.
- **Solo founder:** Track deal flow (Insurance Business, Insurance Journal, Axios Pro) and contact the seller's team at signing, target agencies unlikely to be bought, make data export and carrier-feed continuity explicit, avoid carrier sales.
- **Sourced:**
  - Equal Parts moves acquired agencies onto its in-house operating system (https://www.axios.com/pro/fintech-deals/2026/02/10/equal-parts-25m-insurance-rollup, 2026-02-10); Applied Systems acquired EZLynx, a competing AMS (https://www.insurancebusinessmag.com/us/news/technology/applied-systems-announces-acquisition-of-ezlynx-243576.aspx, 2026)
  - 695 announced insurance distribution deals in 2025, -12%, 95 unique buyers [unverified secondary blog] (https://www.sonant.ai/blog/insurance-industry-consolidation)
  - Independent agencies fell from about 39,000 (2024) to about 37,000 (2026) per Big I Agency Universe Study via ACT [unverified; search summary] (https://www.independentagent.com/wp-content/uploads/2026/02/26_ACT_TechTrendsReport.pdf, 2026-02)
  - HawkSoft: the AMS is the hardest system to change after an acquisition, so migration is planned and can be delayed (https://blog.hawksoft.com/considerations-during-agency-acquisition-or-merge, undated); earnouts run 1-3 years [unverified] (https://acquisitionstars.com/blog/insurance-agency-book-of-business-diligence-ma)
- **[design]:**
  - Agency SaaS 6-10% annual logo churn; carriers 2-5% [design]
  - Reason mix [design]; save rate 15-25% of acquired agencies if reached before the buyer's tech decision [design]

### Manufacturing plants (`manufacturing`)

- **Churn:** 8%-14% annual logo churn (evidence: [design]). Involuntary 4.5% of churned logos (notes' prose range 3%-6%).
- **Reasons:** acquired_or_merged 15%, business_closed 13%, consolidated_vendors 11%, not_using 9%, bugs_reliability 8%, budget_cut 8%, champion_left 7%.
- **Timing:** Mid-market plants renew annually but closures and acquisitions interrupt at any point; parent-driven moves follow the parent's ERP timeline (12-24 months after acquisition); plant closures give weeks of notice and the vendor often learns after the fact.
- **Leading indicators:** seat_decline (30-60 d), acquisition_news (90-365 d), layoffs_or_freeze (30-120 d), champion_departure (30-90 d), usage_drop (14-45 d), closure_news (0-60 d).
- **Saves:** Flex pricing: per active project / per unit with parked-unit credit / seat removal 32%; Reach the buyer / new owner before their tech plan is fixed 12%; Multi-site / group master agreement 25%; Activated integration with their core stack 25%.
- **Solo founder:** Sell to single-site independent plants, watch WARN notices and closure roundups, integrate with the parent ERP before selling multi-site, expect strategic buyers to consolidate MES vendors.
- **Sourced:**
  - About 34.7% of establishments born in 2013 were still operating in 2023 (BLS TED, https://www.bls.gov/opub/ted/2024/34-7-percent-of-business-establishments-born-in-2013-were-still-operating-in-2023.htm, 2024; from the title, not fetched); 5-year survival 51.4% for March 2020 establishments [unverified, third-party reading] (https://startbusinessbystate.com/business-survival-rates-by-state, 2025)
  - Plant Services 2025 roundups of closures: Akebono Brake Kentucky (about 450 jobs), TransAxle 16 US sites (209 jobs), Hubbell Illinois (110 jobs) (https://www.plantservices.com/roundup/article/55292914/factory-fallout-manufacturing-plant-closures-and-layoffs-from-chevron-transaxle-denka-and-more, 2025)
  - MES buyers increasingly favor integrated suites from large ERP and OT vendors (Gartner MES market guide, undated); Emerson/AspenTech, Vista/Amtech, GE Vernova Proficy sale to TPG show MES consolidation (ABI Research 2025; Houlihan Lokey fall 2025: https://cdn.hl.com/pdf/2025/hl-industrial-software-market-update-2025-fall.pdf)
- **[design]:**
  - Plant SaaS 8-14% annual logo churn, revenue churn 6-10% [design]
  - Reason mix [design]; step-down for idle lines saves 25-40% of idle-line churn; acquisition-driven saves under 15% [design]

### Utilities (electric, water, gas; co-ops and municipals) (`utilities`)

- **Churn:** 3%-6% annual logo churn (evidence: [design]). Involuntary 2.0% of churned logos (notes' prose range 0%-3%).
- **Reasons:** contract_term_end_rfp 22%, acquired_or_merged 14%, consolidated_vendors 12%, budget_cut 10%, regulation_change 10%, security_or_compliance 8%, switched_competitor 8%.
- **Timing:** Multi-year terms (5 years plus 1-year extension options) and churn at re-procurement; public RFP gives 9-18 months notice [unverified vendor guidance]; municipal fiscal years often end June 30.
- **Leading indicators:** rfp_posted (270-540 d), term_end_approaching (180-540 d), regulatory_change (90-365 d), acquisition_news (60-180 d), exec_sponsor_change (60-120 d).
- **Saves:** Early extension / renewal with capped increase, offered before a rebid 50%; Respond to an open RFP as incumbent 22%; Ship the compliance package (SOC 2, BAA, VPAT/HECVAT, validation docs) 45%; Listing on a state or cooperative contract vehicle 40%.
- **Solo founder:** Use public procurement portals to find renewal windows, target small municipal utilities and co-ops via state purchasing schedules, get SOC 2 before any public bid, do not bid large RFPs against incumbents.
- **Sourced:**
  - UK water utility award 2025-2030 with extensions to 2035 (https://www.find-tender.service.gov.uk/Notice/009966-2025/PDF, 2025)
  - Fresno billing system renewal authorises three one-year extensions with increases capped at 10% (https://agendas.fresno.gov/en/legislation/id-24-1489-18776, 2024)
  - Wollongong NSW extended a seven-year SaaS contract expiring September 2025 instead of re-procuring (https://www.wollongong.nsw.gov.au/__data/assets/pdf_file/0035/269657/Item-3-Extension-of-Contract-One-Council-Enterprise-Software.pdf, 2025)
  - Yarra Ranges Council replaced three systems with one SaaS suite on a five-year, $7.3M contract [date not confirmed; search summary] (https://www.arnnet.com.au/?p=1256290)
- **[design]:**
  - Annual logo churn 3-6%, revenue churn 2-4% [design]
  - Reason mix [design]; early extension saves 40-60%, an open RFP under 25% [design]

### City and county government (`local_gov`)

- **Churn:** 6%-12% annual logo churn (evidence: [design]). Involuntary 1.5% of churned logos (notes' prose range 0%-2%).
- **Reasons:** contract_term_end_rfp 30%, budget_cut 18%, champion_left 14%, consolidated_vendors 10%, switched_competitor 7%, missing_feature 4%, moved_to_in_house 4%.
- **Timing:** Churn at contract end; fiscal years often end June 30 or September 30; non-renewal notices 60-120 days before, usually via a procurement notice; mid-term termination is rare in a first term.
- **Leading indicators:** rfp_posted (180-365 d), term_end_approaching (180-365 d), exec_sponsor_change (60-120 d), budget_review (60-180 d), usage_drop (30-60 d).
- **Saves:** Early extension / renewal with capped increase, offered before a rebid 50%; Listing on a state or cooperative contract vehicle 40%; Activated integration with their core stack 25%; Second champion / multi-threading (finance, ops, users) 30%.
- **Solo founder:** Keep a contract-end spreadsheet and start renewal talks 9-12 months out, get on a state or cooperative vehicle, build a five-minute renewal packet for procurement, add a second contact in finance.
- **Sourced:**
  - San Francisco OpenGov: a $5.9M award by mayoral directive with no competitive bid (the reverse of a forced rebid) [unverified] (https://sfstandard.com/2026/09/02/san-francisco-opengov-daniel-lurie-contract-software/, 2026-09-02)
  - Naperville, IL moved e-procurement from DemandStar to OpenGov on 2026-01-05, a staff decision [unverified] (https://www.naperville.il.us/globalassets/media/meeting-agendas-and-minutes/managers-memorandum/mm20251218.pdf, 2025-12-18)
  - A 3-5x gap between monthly and annual plan churn is a general SaaS pattern [unverified] (https://stealthagents.com/research/saas-churn-rate-statistics-2026, 2026)
- **[design]:**
  - Annual logo churn 6-12%, revenue churn 4-9% [design]
  - Reason mix [design]; pre-rebid engagement 9-12 months out saves 40-60% [design]
  - Other (new administration reverses a purchase, 1%) mapped to political_termination

### State government agencies (`state_gov`)

- **Churn:** 5%-10% annual logo churn (evidence: [design]). Involuntary 0.8% of churned logos (notes' prose range 0%-1%).
- **Reasons:** budget_cut 28%, contract_term_end_rfp 22%, consolidated_vendors 12%, champion_left 10%, funding_ended 8%, security_or_compliance 5%, switched_competitor 4%.
- **Timing:** Most state fiscal years start July 1; decisions and freezes cluster in spring (budget submission) and fall (mid-year revisions); statewide contracts run 3-5 years with options; freezes can take effect with 2-4 weeks notice.
- **Leading indicators:** layoffs_or_freeze (30-120 d), budget_review (30-120 d), funding_cliff (60-270 d), rfp_posted (180-365 d), exec_sponsor_change (60-120 d).
- **Saves:** Document a freeze exemption (revenue, public safety, federal compliance) 40%; Founder / executive outreach to the economic buyer or successor 40%; Downgrade: fewer seats, units or a cheaper tier 22%; Listing on a state or cooperative contract vehicle 40%.
- **Solo founder:** Check whether the product maps to a freeze exemption (revenue, public safety, federal compliance) and say so in writing, pursue a statewide contract, track state revenue forecasts and freeze notices.
- **Sourced:**
  - California 2023 order required agencies to review IT maintenance and operations contracts, including software licences, and terminate those no longer needed [unverified] (https://meritalkslg.com/articles/california-drops-bombshell-with-state-it-spending-freeze/, 2023)
  - Washington's December 2024 order froze most non-essential service contracts; revenue-generating contracts were exempt [unverified] (https://washingtonstatestandard.com/2024/12/03/wa-gov-inslee-orders-hiring-and-travel-freeze-for-state-agencies/, 2024-12-03)
  - Nebraska July 2026: added cuts and a hiring freeze after a $172M projected deficit; software contracts not mentioned [unverified] (https://www.kwit.org/podcast/spm-news/2026-07-09/nebraska-governor-pillen-announces-plan-to-address-states-budget-shortfall, 2026-07-09)
  - ESSER extensions rescinded March 2025, later partly restored; final late-liquidation deadline 2026-03-28 [unverified] (https://thejournal.com/articles/2025/03/31/ed-abruptly-cancels-esser-funding-extensions.aspx, 2025-03-31)
- **[design]:**
  - Annual logo churn 5-10%, revenue churn 3-8% [design]
  - Reason mix [design]; exec outreach saves 30-50% in a soft freeze [design]

### Federal government (civilian and defense) (`federal`)

- **Churn:** 8%-15% annual logo churn (evidence: [design]). Involuntary 0.5% of churned logos (notes' prose range 0%-1%).
- **Reasons:** contract_term_end_rfp 25%, budget_cut 20%, consolidated_vendors 14%, funding_ended 10%, champion_left 8%, security_or_compliance 7%, switched_competitor 5%.
- **Timing:** Churn lands at option-year or contract-end dates; the fiscal year ends September 30 with spending pushed into Q4 and a lapse in appropriations landing in October; 30-90 days notice for an unexercised option.
- **Leading indicators:** rfp_posted (180-540 d), funding_cliff (60-270 d), regulatory_change (90-365 d), exec_sponsor_change (60-120 d), term_end_approaching (90-365 d).
- **Saves:** Early extension / renewal with capped increase, offered before a rebid 50%; Document a freeze exemption (revenue, public safety, federal compliance) 40%; Ship the compliance package (SOC 2, BAA, VPAT/HECVAT, validation docs) 45%; Listing on a state or cooperative contract vehicle 40%.
- **Solo founder:** Do not build a business on one agency, track option-year dates and SAM.gov sources-sought notices, get a GSA schedule only if the product fits a category agencies already buy, keep ATO / FedRAMP status current.
- **Sourced:**
  - DOGE cancelled about 1,100 federal contracts in early 2025; reporting later found many saved nothing (https://fortune.com/2025/02/25/doge-canceled-1100-federal-contracts-no-save-government-money, 2025-02-25) [unverified]; some cancelled contracts, including software licences, were revived [unverified] (https://www.yahoo.com/news/more-220-million-contracts-canceled-211240992.html)
  - 43-day shutdown 2025-10-01 to 2025-11-12, then a CR to 2026-01-30 [unverified: Wikipedia] (https://en.wikipedia.org/wiki/2026_United_States_federal_budget); the 20 largest civilian agencies spent 63% less in October 2025 than October 2024 [unverified] (https://washingtontechnology.com/contracts/2025/11/civilian-agency-spending-cratered-during-shutdown/409795/, 2025-11)
  - OMB memo M-26-10 (2026-03-31) requires CIO review of covered IT contracts [unverified] (https://govciomedia.com/omb-memo-forces-agencies-to-rethink-procurement-oversight/, 2026)
  - GSA said it would negotiate directly with IT vendors rather than resellers [unverified] (https://washingtontechnology.com/opinion/2025/12/doge-was-government-contractings-biggest-story-2025-and-its-not-close/410372/, 2025-12)
- **[design]:**
  - Annual logo churn 8-15%, revenue churn 6-12% [design]
  - Reason mix [design], with shutdown and DOGE-era shares weighted up for 2025-2026
  - Pre-option call 90 days out is the main save point [design]

### K-12 school districts (`k12`)

- **Churn:** 15%-25% annual logo churn (evidence: [design]). Involuntary 2.0% of churned logos (notes' prose range 1%-10%).
- **Reasons:** budget_cut 22%, funding_ended 18%, consolidated_vendors 16%, not_using 14%, champion_left 8%, contract_term_end_rfp 8%, switched_competitor 5%.
- **Timing:** District fiscal year usually July 1 to June 30; renewal decisions cluster late winter to June; spikes in June-August and January-February (budget revisions); teacher-adopted tools can vanish with no notice.
- **Leading indicators:** usage_drop (60-120 d), exec_sponsor_change (60-120 d), funding_cliff (120-365 d), budget_review (90-180 d), plan_downgrade (7-45 d).
- **Saves:** Multi-year term with price lock / cap 50%; Downgrade: fewer seats, units or a cheaper tier 35%; Help the buyer move the spend to another funding line 30%; Usage report and user survey before renewal 40%.
- **Solo founder:** Build a renewal calendar by district fiscal year starting in February, send principals a monthly usage summary, offer a cheap essentials tier under the board threshold, check which districts are on grant money before selling.
- **Sourced:**
  - Denver Public Schools cut digital tools from more than 1,000 to 346, saving about $1M, and reviews all apps every two years (EdWeek, https://www.edweek.org/technology/how-this-district-cut-hundreds-of-ed-tech-tools-and-saved-1m/2025/07, 2025-07); LearnPlatform: districts averaged 2,982 tools in 2024-25, up from 2,739 [unverified]
  - Lighter Capital: education-vertical customer churn doubling from 11% (2024) to 22% (2025), 155 private SaaS startups [unverified: secondary citation via WeAreFounders; the 22% was not visible on Lighter's page] (https://www.lightercapital.com/blog/2025-b2b-saas-startup-benchmarks; https://www.wearefounders.uk/saas-churn-rates-and-customer-acquisition-costs-by-industry-2025-data/)
  - ESSER III liquidation ended with a 2026-03-28 final deadline after 2025 reversals and litigation (The Journal, https://thejournal.com/articles/2025/03/31/ed-abruptly-cancels-esser-funding-extensions.aspx, 2025-03-31) [final date unverified]
  - Speakable district plans bill annually, no auto-renew unless the order form says so, written cancellation 30 days before renewal [unverified, one vendor] (https://www.speakable.io/policies/cancellation-policy); a Kami teacher found the app on hold after the district stopped buying (https://community.kamihq.com/t/i-think-my-school-is-not-renewing-kami/5750)
- **[design]:**
  - Annual logo churn 15-25% for district central-office tools, 30-50% for teacher-adopted tools; revenue churn 10-15% [design]
  - Reason mix [design]
  - Multi-year lock before budget adoption saves 40-60%; a bridge year saves 30-40% [design]

### Colleges and universities (`higher_ed`)

- **Churn:** 8%-15% annual logo churn (evidence: [design]). Involuntary 1.0% of churned logos (notes' prose range 0%-2%).
- **Reasons:** consolidated_vendors 20%, budget_cut 16%, champion_left 14%, not_using 13%, acquired_or_merged 8%, switched_competitor 8%, contract_term_end_rfp 7%.
- **Timing:** Many public universities run July 1 fiscal years so renewals cluster in spring and early summer; academic-year contracts start August or September with decisions January to May; RFP-driven losses give 60-120 days.
- **Leading indicators:** exec_sponsor_change (60-120 d), rfp_posted (120-270 d), security_review_stall (30-120 d), usage_drop (30-60 d), budget_review (90-180 d).
- **Saves:** Usage report and user survey before renewal 42%; Multi-year term with price lock / cap 40%; Activated integration with their core stack 25%; Second champion / multi-threading (finance, ops, users) 30%.
- **Solo founder:** Sell to departments with discretionary budgets and cards below the RFP threshold, align billing to the academic calendar, give champions a one-page usage report, watch acquisitions in the sector.
- **Sourced:**
  - Cost inflation pushes institutions to consolidate vendors and demand clearer ROI [unverified newsletter] (https://higheredintel.substack.com/p/cost-inflation-pressures-campuses, 2025-12)
  - Ellucian closed its Anthology SIS and ERP acquisition at the end of 2025, adding 260 customers [unverified, vendor-press] (https://erp.today/ellucian-completes-anthology-sis-and-erp-acquisition-adding-260-higher-education-customers/); Anthology's enrollment business went to Encoura in early 2026 [unverified]
  - University of Colorado renewed SAP Concur for three years in 2024 after market research and a user survey, concluding switching costs outweighed benefits (https://www.cu.edu/print/blog/psc-communicator/concur-travel-and-expense-renewal)
  - University of Salford Mentimeter renewal review notice, Feb 2025 [unverified] (https://www.contractsfinder.service.gov.uk/Notice/21078505-3f30-4283-a47d-b42d4a5dade1)
- **[design]:**
  - Annual logo churn 8-15%, revenue churn 5-10% [design]
  - Reason mix [design]; a user survey before renewal saves 35-50% [design]

### Nonprofits and associations (`nonprofits`)

- **Churn:** 10%-25% annual logo churn (evidence: [design]). Involuntary 5.0% of churned logos (notes' prose range 3%-6%).
- **Reasons:** budget_cut 24%, funding_ended 22%, not_using 12%, price_too_high 8%, champion_left 7%, platform_built_in 6%, consolidated_vendors 6%.
- **Timing:** Churn clusters at grant end dates (often mid-year) and fiscal-year end (July 1 or calendar year); stress shows as downgrades first, cancellations later; vendor notice often under 30 days.
- **Leading indicators:** funding_cliff (30-180 d), champion_departure (30-90 d), failed_payment (0-7 d), layoffs_or_freeze (30-120 d), usage_drop (30-60 d), plan_downgrade (7-45 d).
- **Saves:** Pause plan (1-3 months, data kept) 28%; Downgrade: fewer seats, units or a cheaper tier 22%; Move to annual prepay at a discount 15%; Help the buyer move the spend to another funding line 30%.
- **Solo founder:** Record the grant end date at onboarding, offer a pause plan and basic tier before the grant ends, target dues-based associations, do not anchor pricing to Microsoft or Google nonprofit programs.
- **Sourced:**
  - Urban Institute / Chronicle of Philanthropy 2025: 21% of nonprofits that lost government funding had a grant or contract end, and 29% of those hit reduced staff [unverified; garbled secondary summary] (https://www.philanthropy.com/article/a-third-of-u-s-nonprofits-that-serve-communities-lost-government-funding-in-early-2025)
  - Minnesota Council of Nonprofits 2025 Pulse Check: organizations under strain cut staff and programs before closing; none said they were very likely to close within 12 months (https://minnesotanonprofits.org/wp-content/uploads/2026/01/2025-Pulse-Check-Report.pdf, uploaded 2026-01)
  - Microsoft retired its nonprofit Business Premium and E1 grant offers (renewals through the next renewal on or after 2025-07-01), affecting about 400,000 nonprofits [unverified, advocacy press] (https://wholewhale.com/resources/400k-nonprofits-impacted-by-microsoft-grant-cancellation-coming-july-2025/); a Cybernews claim of retirement in June 2026 is unconfirmed (https://cybernews.com/tech/microsoft-data-non-profits/)
  - Connecticut Nonprofit Alliance Survey of Federal Impact (https://ctnonprofitalliance.org/wp-content/uploads/2025/10/Survey-of-Federal-Impact.pdf, 2025-10)
- **[design]:**
  - Annual logo churn 15-25% for small and mid nonprofits, 10-15% for dues-based associations; revenue churn 10-20% [design]
  - Reason mix [design]; a pause plan saves 20-35% of accounts facing a grant gap [design]

### Churches and religious organizations (`churches`)

- **Churn:** 12%-20% annual logo churn (evidence: [design]). Involuntary 4.0% of churned logos (notes' prose range 2%-5%).
- **Reasons:** champion_left 22%, switched_competitor 15%, business_closed 12%, price_too_high 10%, not_using 10%, missing_feature 8%, poor_support 7%.
- **Timing:** Budget year is usually the calendar year, so tool costs get cut in October-December; pastoral transitions cluster in summer and trigger tool changes; a closure is sudden, a pastor resignation gives 1-3 months.
- **Leading indicators:** champion_departure (30-90 d), usage_drop (30-60 d), seat_decline (30-60 d), failed_payment (0-7 d), closure_news (0-60 d), budget_review (30-90 d).
- **Saves:** Handoff to the new leader within 30 days 30%; Move to annual prepay at a discount 15%; Downgrade: fewer seats, units or a cheaper tier 22%; Onboarding rescue: call, data import, setup help in first 14 days 25%.
- **Solo founder:** Pick one denomination or network, build the leadership-change handoff (second admin, training plan) into onboarding, offer a low-priced small-church plan with no lock-in.
- **Sourced:**
  - Lifeway: 1.8% of 49,842 active Southern Baptist congregations (2022) disbanded or closed by 2023, about 18% over a decade at that rate; Duke's Mark Chaves cites about 1 in 100 churches closing per year; 94% of pastors expect their church open in 10 years (https://news.lifeway.com/2025/04/15/few-protestant-pastors-believe-their-churches-will-close-soon/, 2025-04-15)
  - Capterra reviews: a Planning Center Giving reviewer moved from Pushpay to a cheaper, easier tool after a contract lock-in; another left CCB and Pushpay because the older platform lagged [unverified, individual reviews] (https://www.capterra.com/p/76708/Planning-Center/reviews/)
  - Religion News Service on pastor optimism vs closures (https://religionnews.com/2025/04/16/most-pastors-think-their-churches-wont-close-anytime-soon-they-are-right-for-now/, 2025-04-16)
- **[design]:**
  - Annual logo churn 12-20%, revenue churn 8-14%; small churches (under 100 attendance) churn most [design]
  - Reason mix [design]
  - Handoff to the new leader within 30 days is often the difference between keeping and losing the account [design]

### B2C app categories

Anchors for every category (RevenueCat, 2026-03-19, updated 2026-04-22; https://www-docs.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026): about 72% of annual subscribers cancel in year 1 (about 56% in 2025); 35% of annual cancellations in month 1; involuntary failures are 31% of cancellations on Google Play and 14% on the App Store; trial-to-paid 42.5% for 17-32 day trials vs 25.5% under 4 days; day-35 hard paywall 10.7% vs freemium 2.1%; reactivation of cancelled annual subscribers about 4.9-5.9%. Adapty: median refund rate 2.71%, annual subscriptions 6-7.6% (https://uploads.adapty.io/the_guide_on_managing_refunds_for_subscription_apps.pdf, undated). Cancellation reasons in the 2025 RevenueCat data (secondary summary, [unverified]): not enough usage 37%, cost 35%, better alternative 10%, technical 7%. The reason tables below are [design] and are stated reasons, not root causes (a user who never reached value often says "too expensive").

#### Health and fitness (`health_fitness`)

- **Churn:** monthly 9%-12%; year-1 annual cancel rate 72%; involuntary 20% of cancellations.
- **Reasons:** not_using 32%, payment_failed 20%, price_too_high 20%, found_free_alternative 8%, achieved_goal 7%, subscription_fatigue 4%, bugs_reliability 4%.
- **Trial-to-paid drop-off:** Workout or meal plan did not fit the user's schedule (30%); Paywall shown before the user saw the content (25%); Free tier gave enough to stop there (20%); Cancelled in the first 3 days (15%); Watch / HealthKit sync problems (10%) [design weights].
- **Refunds and chargebacks:** refund rate 3%-6%, chargeback rate 0%-1% [design; no chargeback source found].
- **Win-back (6 months):** monthly plans 10%-20%, annual plans 2%-5% [design].
- **Timing:** January spike then drop; summer dip; refund requests cluster in the days after the first annual charge.
- **Saves:** Consumer cancel flow: pause or switch to monthly 20%; Renewal reminder email before annual charge 30%; Dunning: smart retries plus failed-payment emails 42%; Event-timed win-back (January, new season, model upgrade, new project) 12%; Streak / habit re-engagement push 15%.
- **Founder:** Show content before the paywall, fit the plan to the user's schedule, time offers to January and pre-event, and expect annual-plan refund requests in the first days after charge.
- **Sourced:**
  - H&F median trial usage 6.7% of installs, behind only Business at 6.9% (games 2.9%) [unverified] (https://gigazine.net/gsc_news/en/20240313-apps-subscription-stats, 2024-03-13); trial-to-paid medians of about 35-40% [unverified secondary]
  - Involuntary billing failures are 31% of cancellations on Google Play (28.2% in 2025) and 14% on the App Store (15.1% in 2025) (RevenueCat, https://www-docs.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026, 2026-03-19, updated 2026-04-22)
- **[design]:**
  - Monthly churn 9-12% and year-1 annual cancel rate near the all-app 72% [design]; no public category figure
  - Reason mix and win-back [design]; chargebacks have no source (app-store billing near zero, web-billed higher)

#### Productivity (`productivity`)

- **Churn:** monthly 7%-10%; year-1 annual cancel rate 70%; involuntary 20% of cancellations.
- **Reasons:** not_using 27%, payment_failed 20%, found_free_alternative 15%, price_too_high 13%, subscription_fatigue 6%, bugs_reliability 5%, forgot_or_surprised_renewal 5%.
- **Trial-to-paid drop-off:** Never created a second real item (list, note, calendar sync) (35%); Setup friction and an empty first session (25%); 3-day trial too short to build a habit (17-32 day trials convert 42.5% vs 25.5% for under 4 days) (20%); Apple Reminders, Notion free or Google Keep was enough (20%) [design weights].
- **Refunds and chargebacks:** refund rate 3%-5%, chargeback rate 0%-1% [design; no chargeback source found].
- **Win-back (6 months):** monthly plans 5%-10%, annual plans 2%-5% [design].
- **Timing:** Used in bursts; students churn at exam periods and semester end; refund requests cluster at the first annual renewal.
- **Saves:** Consumer cancel flow: pause or switch to monthly 20%; Renewal reminder email before annual charge 30%; Dunning: smart retries plus failed-payment emails 42%; Event-timed win-back (January, new season, model upgrade, new project) 12%.
- **Founder:** Get users to a second real item quickly, prefer 7-day-plus trials, and ship visible features that give lapsed users a reason to return.
- **Sourced:**
  - Trial-to-paid: 42.5% median for 17-32 day trials, 25.5% for trials under 4 days; day-35 hard paywall 10.7% vs freemium 2.1% (RevenueCat, https://www-docs.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026, 2026-03-19)
  - RevenueCat 2025 cancellation reasons (secondary summary): not enough usage 37%, cost 35%, better alternative 10%, technical 7% [unverified] (https://www.revenuecat.com/blog/growth/subscription-app-churn-reasons-how-to-fix.md)
- **[design]:**
  - Monthly churn 7-10% [design]; winback 5-10% within 6 months is [design] (no source)

#### Education and language learning (`education_language`)

- **Churn:** monthly 8%-12%; year-1 annual cancel rate 72%; involuntary 20% of cancellations.
- **Reasons:** not_using 25%, payment_failed 20%, achieved_goal 13%, price_too_high 13%, found_free_alternative 11%, subscription_fatigue 5%, forgot_or_surprised_renewal 5%.
- **Trial-to-paid drop-off:** Streak lost after 2-3 weeks (35%); Lesson fatigue at the first plateau (30%); Free tier of the same app was enough (20%); Trial too short to see progress (15%) [design weights].
- **Refunds and chargebacks:** refund rate 2%-5%, chargeback rate 0%-0% [design; no chargeback source found].
- **Win-back (6 months):** monthly plans 8%-15%, annual plans 2%-4% [design].
- **Timing:** Exam periods and travel seasons; achieved-goal churners (trip done, test passed) rarely return.
- **Saves:** Consumer cancel flow: pause or switch to monthly 20%; Renewal reminder email before annual charge 30%; Dunning: smart retries plus failed-payment emails 42%; Event-timed win-back (January, new season, model upgrade, new project) 12%; Streak / habit re-engagement push 15%.
- **Founder:** Protect the streak, send re-engagement tied to a streak reset, and accept that achieved-goal churners rarely return.
- **Sourced:**
  - Duolingo Western-market churn about 28% in late 2025, down from 47% in 2020, paid base 12.2M [unverified: secondary Substack summary; period unit unclear] (https://sergeycyw.substack.com/p/duolingo-q1-2025-earnings-analysis, 2025)
  - Language-learning retention below several other categories; free-to-paid conversion around 2-5% on iOS [unverified] (https://www.businessofapps.com/?p=56781, undated)
- **[design]:**
  - Monthly churn 8-12% for smaller language apps [design]; streak re-engagement push brings 8-15% back within 6 months [design]

#### Photo and video (`photo_video`)

- **Churn:** monthly 8%-12%; year-1 annual cancel rate 76%; involuntary 20% of cancellations.
- **Reasons:** payment_failed 20%, not_using 20%, achieved_goal 16%, found_free_alternative 12%, price_too_high 11%, bugs_reliability 5%, forgot_or_surprised_renewal 5%.
- **Trial-to-paid drop-off:** One-off project (wedding video, trip edit) finished (35%); Paywall or watermark at export (25%); CapCut or the phone's built-in editor (25%); Export crashes or sync problems (15%) [design weights].
- **Refunds and chargebacks:** refund rate 3%-8%, chargeback rate 0%-1% [design; no chargeback source found].
- **Win-back (6 months):** monthly plans 8%-12%, annual plans 2%-5% [design].
- **Timing:** Event-driven and seasonal (holidays, weddings, travel); export-paywall trial-to-paid is typically higher than onboarding-paywall.
- **Saves:** Consumer cancel flow: pause or switch to monthly 20%; Renewal reminder email before annual charge 30%; Dunning: smart retries plus failed-payment emails 42%; Event-timed win-back (January, new season, model upgrade, new project) 12%; Free tier fallback instead of cancel 20%.
- **Founder:** Put the paywall at export, fix export reliability, and time win-back offers to the next event (holiday, trip, wedding).
- **Sourced:**
  - AI-powered products are 61.4% of photo and video apps in one 2026 summary [unverified]; RevenueCat 2026: AI apps churn 30-36% faster (sources disagree) (https://techcrunch.com/2026/03/10/ai-powered-apps-struggle-with-long-term-retention-new-report-shows, 2026-03-10)
- **[design]:**
  - Monthly churn 8-12%; year-1 annual cancel rate 0.76 because the AI-feature subset churns fastest [design]
  - Event-timed offers bring 8-12% back within 6 months [design]

#### Finance and budgeting (`finance`)

- **Churn:** monthly 5%-8%; year-1 annual cancel rate 62%; involuntary 20% of cancellations.
- **Reasons:** not_using 22%, payment_failed 20%, price_too_high 16%, found_free_alternative 11%, achieved_goal 9%, bugs_reliability 8%, forgot_or_surprised_renewal 4%.
- **Trial-to-paid drop-off:** Bank link broke or never connected (35%); No budget set before the trial ended (30%); Trial shorter than a billing cycle: no monthly summary seen (20%); Mistook the charge for a bank fee (15%) [design weights].
- **Refunds and chargebacks:** refund rate 2%-4%, chargeback rate 0%-1% [design; no chargeback source found].
- **Win-back (6 months):** monthly plans 6%-10%, annual plans 3%-6% [design].
- **Timing:** Lower monthly churn because bank connections create switching cost; tax season and year-end resets; win-back works when the bank changes or a new year starts.
- **Saves:** Consumer cancel flow: pause or switch to monthly 20%; Renewal reminder email before annual charge 30%; Dunning: smart retries plus failed-payment emails 42%; Event-timed win-back (January, new season, model upgrade, new project) 12%.
- **Founder:** Make the bank link reliable, ensure the trial covers a full billing cycle, and reach out when a user changes bank or at new year.
- **Sourced:**
  - No category-level figure published; all-app anchors: 72% of annual subscribers cancel in year 1 (2026; 56% in 2025), 35% of annual cancellations in month 1 (RevenueCat, https://www-docs.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026, 2026-03-19, updated 2026-04-22)
- **[design]:**
  - Monthly churn 5-8%, lower than most consumer categories (bank links add switching cost) [design]
  - Year-1 annual cancel 0.62 [design]; no public category data

#### Dating and social (`dating_social`)

- **Churn:** monthly 12%-18%; year-1 annual cancel rate 70%; involuntary 20% of cancellations.
- **Reasons:** achieved_goal 23%, not_using 21%, payment_failed 20%, price_too_high 9%, found_free_alternative 8%, subscription_fatigue 4%, forgot_or_surprised_renewal 4%.
- **Trial-to-paid drop-off:** No matches or first conversation (40%); Matched quickly then a bad experience (25%); Re-subscribed after an expired trial, charged, refunded (20%); Safety or harassment (15%) [design weights].
- **Refunds and chargebacks:** refund rate 4%-10%, chargeback rate 0%-1% [design; no chargeback source found].
- **Win-back (6 months):** monthly plans 15%-25%, annual plans 3%-6% [design].
- **Timing:** New-year spike and post-holiday drop; success ends the need, so achieved_goal is the biggest single reason; users return when they reset their profile or move city.
- **Saves:** Consumer cancel flow: pause or switch to monthly 20%; Renewal reminder email before annual charge 30%; Dunning: smart retries plus failed-payment emails 42%; Event-timed win-back (January, new season, model upgrade, new project) 12%.
- **Founder:** Treat achieved_goal as a success metric, guard against trial-abuse cycles, and expect high refund rates.
- **Sourced:**
  - Of 6,089 US Tinder subscribers who paid July 2024-June 2026 and then stopped, 90.3% did not buy another paid dating app; about 7% moved to Bumble and about 3% to Grindr [unverified; cohort definition garbled, windows approximate] (https://ask.yipitdata.com/insights/lapsed-tinder-payers-category-exit)
  - RevenueCat data suggests about 20% of churned monthly subscribers reactivate within a year, 6% to 36% by category [unverified summary] (https://www-docs.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026, 2026-03-19)
  - Refund requests after a trial-abuse cycle; a RevenueCat staffer says AI categories see higher refunds [anecdotal] (https://community.revenuecat.com/general-questions-7/higher-refund-rate-6814, 2025-08)
- **[design]:**
  - Monthly churn 12-18%, the highest listed, because the job is "find someone" [design]
  - Win-back 15-25% within 6 months [design / unverified]

#### AI assistants and creative tools (`ai_tools`)

- **Churn:** monthly 11%-15%; year-1 annual cancel rate 79%; involuntary 20% of cancellations.
- **Reasons:** found_free_alternative 21%, payment_failed 20%, not_using 19%, price_too_high 13%, subscription_fatigue 8%, bugs_reliability 5%, forgot_or_surprised_renewal 4%.
- **Trial-to-paid drop-off:** Novelty of model output fades in the first two weeks (35%); User tries the newest model elsewhere (30%); Usage caps or credits run out (20%); Output quality, latency or outages (15%) [design weights].
- **Refunds and chargebacks:** refund rate 4%-9%, chargeback rate 0%-1% [design; no chargeback source found].
- **Win-back (6 months):** monthly plans 10%-20%, annual plans 4%-6% [design].
- **Timing:** Drop is in the first two weeks; monthly subscribers return when a model upgrade ships; annual ones rarely return (about 5%); school term and tax deadlines cause small seasonal dips.
- **Saves:** Consumer cancel flow: pause or switch to monthly 20%; Renewal reminder email before annual charge 30%; Dunning: smart retries plus failed-payment emails 42%; Event-timed win-back (January, new season, model upgrade, new project) 12%; Downgrade: fewer seats, units or a cheaper tier 22%.
- **Founder:** Measure retention from month 3 (AI tourists), watch rival model releases, and reward upgrades; annual AI subscribers rarely return.
- **Sourced:**
  - RevenueCat 2026: AI apps churn about 30-36% faster than non-AI apps (summaries disagree); 12-month retention 21.1% (AI) vs 30.7% (non-AI); monthly retention 6.1% vs 9.5%; year-1 realised LTV $30.16 vs $21.37 median (https://techcrunch.com/2026/03/10/ai-powered-apps-struggle-with-long-term-retention-new-report-shows, 2026-03-10; https://www.computing.co.uk/news/2026/ai-powered-apps-struggle-retain-subscribers, 2026)
  - Reactivation of cancelled annual subscribers about 4.9-5.9%; 95% never return (RevenueCat 2026 part two via PPC Land, https://ppc.land/95-of-annual-app-subscribers-who-cancel-never-return-revenuecat-finds/, undated)
  - ChartMogul / Growth Unhinged (2025-12-10): AI-native median GRR 40%, NRR 48%; AI products under $50 a month GRR 23% (about 50 companies per sub-bucket, "directional") (https://www.growthunhinged.com/p/the-ai-churn-wave)
- **[design]:**
  - Monthly churn 11-15% derived as 1.3-1.36x a ~9% non-AI base [design]
  - Year-1 annual cancel 0.79 = 1 - 21.1% 12-month retention (a different measure than RevenueCat's annual-subscriber 72%)

#### Meditation and wellness (`meditation_wellness`)

- **Churn:** monthly 8%-12%; year-1 annual cancel rate 72%; involuntary 20% of cancellations.
- **Reasons:** not_using 26%, payment_failed 20%, found_free_alternative 15%, price_too_high 14%, achieved_goal 7%, subscription_fatigue 5%, forgot_or_surprised_renewal 4%.
- **Trial-to-paid drop-off:** Did one session and felt no change (45%); Trial under 7 days (30%); Free apps or YouTube (25%) [design weights].
- **Refunds and chargebacks:** refund rate 3%-6%, chargeback rate 0%-1% [design; no chargeback source found].
- **Win-back (6 months):** monthly plans 15%-20%, annual plans 5%-8% [design].
- **Timing:** Drop at day 0-3; January reset and exam periods; annual-plan buyers who used one session ask for refunds.
- **Saves:** Consumer cancel flow: pause or switch to monthly 20%; Renewal reminder email before annual charge 30%; Dunning: smart retries plus failed-payment emails 42%; Event-timed win-back (January, new season, model upgrade, new project) 12%; Streak / habit re-engagement push 15%.
- **Founder:** Get a second session in days 0-3, use 7-day-plus trials, and refund annual buyers who used one session rather than lose them to chargebacks.
- **Sourced:**
  - Of 290 observed Headspace cancellers, 4.9% resumed Headspace within 180 days (small cohort, limited coverage) (https://ask.yipitdata.com/insights/headspace-cancelers-calm-starts, undated)
  - A developer-forum post claims a cancellation survey with tailored offers saved 47% of cancellations [unverified self-report] (https://community.web2wave.com/t/we-halved-our-churn-rate-with-custom-win-back-offers-at-cancellation/1243)
- **[design]:**
  - Monthly churn 8-12% [design]; no churn number published by Headspace or Calm
  - Win-back 5-8% in 6 months for annual plans, 15-20% for monthly [design]

#### Games and entertainment subscriptions (`games_entertainment`)

- **Churn:** monthly 10%-15%; year-1 annual cancel rate 72%; involuntary 20% of cancellations.
- **Reasons:** payment_failed 20%, subscription_fatigue 19%, price_too_high 18%, not_using 18%, achieved_goal 8%, found_free_alternative 5%, forgot_or_surprised_renewal 4%.
- **Trial-to-paid drop-off:** Free content does not show the paid benefit in the first session (50%); Price or bundle price (30%); Low trial usage (2.9% of installs) (20%) [design weights].
- **Refunds and chargebacks:** refund rate 3%-8%, chargeback rate 0%-1% [design; no chargeback source found].
- **Win-back (6 months):** monthly plans 4%-6%, annual plans 2%-5%, season-pass users 15%-25% [design].
- **Timing:** Season-pass cycles and new releases; cancelling removes battle-pass access at period end; season-pass users return at each new season (15-25% of lapsed, [design]).
- **Saves:** Consumer cancel flow: pause or switch to monthly 20%; Renewal reminder email before annual charge 30%; Dunning: smart retries plus failed-payment emails 42%; Event-timed win-back (January, new season, model upgrade, new project) 12%; Downgrade: fewer seats, units or a cheaper tier 22%.
- **Founder:** Tie offers to season starts and releases, expect subscription fatigue and affordability to dominate, and handle accidental renewals and child purchases gracefully.
- **Sourced:**
  - Circana survey: about 40% of recent Xbox Game Pass Essential and PlayStation Plus Essential cancellers said they still liked the service but could no longer afford it; Nintendo Switch Online 50% (via IBTimes, https://www.ibtimes.co.uk/xbox-game-pass-cancellations-circana-survey-1819309, undated)
  - Battle-pass and VIP access end at period end after cancelling (Epic help, https://www.epicgames.com/help/c-202300000001636/c-202300000001721/why-did-i-lose-access-to-the-new-battle-pass-after-canceling-my-fortnite-crew-subscription-a202300000016043)
- **[design]:**
  - Mobile game subscription monthly churn 10-15% [design]; no public category figure
  - winbackSeasonPass 15-25% is [design]; winbackMonthly is for standing subscriptions

## 4. How the data maps onto the game

- `CHURN_REASONS` ids line up with the brief's list. Game `cancelReason` strings map through `GAME_REASON_ALIASES` / `reasonForGameCancel()` (e.g. `felt_ignored` is `poor_support`, `renewal_declined` is `contract_term_end_rfp`, `price_increase` is `price_too_high`).
- `surveyAnswer()` returns a `category` that is one of the existing exit-survey categories in `public/apps/product/panel.js` (`too_expensive`, `missing_feature`, `not_using`, `bugs`, `switched`, `no_longer_needed`, `felt_ignored`, `payment_failed`) or `null` for no answer, plus a `misleading` flag.
- `SEGMENT_CHURN[id].signals` use the lead-day vocabulary that the Success app (health, champion, renewal pipeline at T-90/60/30) already reasons in.
- `saveable` rates and `SAVE_TACTICS` rates are per at-risk account when the right offer is made in time.
