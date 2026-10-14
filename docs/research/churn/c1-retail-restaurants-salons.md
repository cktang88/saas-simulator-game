# C1 churn research: mom-and-pop retail, independent restaurants, salons/spas/boutique fitness

Research date: 2026-10-14. Labels: figures with a URL and date are cited. [unverified] = secondary or vendor source I could not check against the primary document. [design] = my estimate. Segment-specific churn data is very thin; most reason mixes below are [design] estimates anchored on the cross-segment data in the shared section.

## Shared anchors (all segments)

- Cancellation reasons, Churnkey survey of about 2M responses, all SaaS (not segment-specific): budget limitations 33.0%, infrequent usage 30.6%, expectations not met 8.6%, technical issues 4.7%, alternative solutions 4.3%, usability 1.0%, other 17.9%. Source: https://churnkey.co/blog/voluntary-churn-benchmarks/ (updated 2025-12-13).
- Stripe-cited B2B annual churn 38%, of which 32 points voluntary (84% of B2B churn is voluntary). Source: same Churnkey page, citing Stripe [unverified, secondhand].
- Annual SMB logo churn figures conflict by about 3x: ChartMogul 2025 median 10–14% for SMB-focused SaaS (cited secondhand, https://www.wearetenet.com/blog/saas-churn-rate-statistics, date unclear) [unverified]; a 2026 cohort study of 38 clients puts SMB at 31% (https://stealthagents.com/research/saas-churn-rate-statistics-2026, 2026) [unverified]. Treat 20–30% annual logo churn as the plausible band for these three segments [design].
- Involuntary churn: Churnkey reports involuntary churn around 1% per period (2024 data, secondary) [unverified]. Vendor blogs claim 20–40% of total cancellations are involuntary (no primary source found) [unverified]. Recovery: a 47.6% median dunning recovery rate is attributed to Recurly (2025) via secondary sites [unverified].

---

## 1. Mom-and-pop independent retail

**1. Churn level.** No verified SaaS churn figure for independent retail. Closure base rate: a third-party summary of BLS Business Employment Dynamics lists retail trade 5-year survival at 54.2% (so about 46% of new retail establishments are gone by year 5) [unverified, secondhand; BLS source: https://www.bls.gov/opub/ted/2024/34-7-percent-of-business-establishments-born-in-2013-were-still-operating-in-2023.htm for the general pattern]. Estimated SaaS logo churn for POS, inventory, and online-store tools sold to this segment: 20–30% annual on monthly plans, 10–15% on annual prepay [design]. Involuntary share (failed cards on a small-shop account): 10–20% of cancellations [design].

**2. Reason mix (estimated share of cancellations).**

| Reason id | Share |
|---|---|
| business_closed | 18% |
| not_using / low_adoption | 14% |
| budget_cut | 12% |
| price_too_high | 9% |
| payment_failed | 9% |
| owner_retired_or_sold | 8% |
| switched_competitor | 7% |
| platform_built_in | 7% |
| onboarding_failed | 6% |
| missing_feature | 5% |
| poor_support | 2% |
| seasonal_pause | 3% |
| **Total** | **100%** |

All shares are [design]. Context: tariff pressure on small shops was reported in early 2025 (Modern Retail, 2025-02-24, https://www.modernretail.co/operations/its-covid-2-0-mom-and-pop-shops-are-already-feeling-the-squeeze-of-trumps-tariff-wars/) and Coresight counted about 8,200 US store closures in 2025, up 12% from 2024, across all retailers (not independents) [unverified, https://macaubusiness.com/economic-watch-u-s-retailers-see-8200-closures-in-2025-amid-tariffs-debt-pressures/]. Platform_built_in is mostly marketplace/social storefronts and Square/Shopify bundles.

**3. Leading indicators.** Card declines on file (payment_failed precedes silent churn by 1–2 cycles). Login and sales-sync volume falling over 60–90 days. Owner stops responding to invoices. Hours cut or a "closed for inventory" note in the account. Store count or register count drops. Sales-tax filing lapses. Season ends (seasonal_pause).

**4. Timing.** Most churn at monthly renewal and after lease renewal dates. Post-holiday (January–February) is a common closure window for gift and seasonal retail [design]. Notice is usually zero for closure (the owner just stops paying) and a few days for a card failure. Business closures show up as a sudden stop in transactions, not a cancel request.

**5. Save tactics.** Pause plans work for seasonal_pause and budget_cut but not for business_closed. Downgrade to a cheaper tier for budget cuts. Annual prepay reduces monthly exits but has no verified save rate. Dunning with card-updater and retries typically recovers a minority of failed payments; a commonly cited median is 47.6% for subscription businesses generally [unverified]. Save rates for this segment are unknown; I would not quote one [design].

**6. What a solo founder can realistically do.** Offer a no-contract monthly plan with an annual option, and enable automatic card updates. Watch for transaction drops and send a short, human check-in to owners who stop logging in. Ask closing owners for a data export and a closure reason, then mark the account as business_closed (this keeps your churn metric honest). Avoid building enterprise features for this segment; the buyer is the owner and the budget is small.

**7. Sources.**
- https://churnkey.co/blog/voluntary-churn-benchmarks/ (2025-12-13)
- https://www.bls.gov/opub/ted/2024/34-7-percent-of-business-establishments-born-in-2013-were-still-operating-in-2023.htm (2024)
- https://www.modernretail.co/operations/its-covid-2-0-mom-and-pop-shops-are-already-feeling-the-squeeze-of-trumps-tariff-wars/ (2025-02-24)
- https://macaubusiness.com/economic-watch-u-s-retailers-see-8200-closures-in-2025-amid-tariffs-debt-pressures/ (2026, undated)
- https://www.wearetenet.com/blog/saas-churn-rate-statistics (undated)

---

## 2. Independent restaurants and small groups

**1. Churn level.** Closure base rate is high. Technomic: independent US restaurant locations fell from 422,001 (2024) to 412,498 (end 2025), down 2.3%, with full-service down 2.6% and limited-service down 1.8%. Source: Nation's Restaurant News, 2026-02-24, https://www.nrn.com/independent-restaurants/the-independent-restaurant-sector-shrunk-by-2-3-in-2025 (verified). The same article says 42% of operators reported their business was not profitable in 2025. First-year failure is often cited at 14–30% (NRA) or about 17% (BLS) [unverified, secondary sites]. Toast: about 164,000 locations at end 2025, 30,000 net adds, and SaaS net retention of 109% in 2025 (Q4 2025 call; https://www.businesswire.com/news/home/20260212058106/en/Toast-Announces-Fourth-Quarter-and-Full-Year-2025-Financial-Results). Toast churn "slightly above 10%" annualized, mostly smaller restaurants, is from an undated analyst Q&A summary [unverified, https://fintool.com/app/research/companies/TOST]. Estimated logo churn for restaurant SaaS (POS, scheduling, reservations, inventory) sold to independents: 15–30% annual [design]. Involuntary share: 10–20% [design].

**2. Reason mix (estimated share of cancellations).**

| Reason id | Share |
|---|---|
| business_closed | 26% |
| switched_competitor | 12% |
| price_too_high | 9% |
| budget_cut | 9% |
| not_using / low_adoption | 8% |
| payment_failed | 7% |
| platform_built_in | 6% |
| owner_retired_or_sold | 6% |
| bugs_reliability | 6% |
| champion_left | 5% |
| acquired_or_merged | 3% |
| missing_feature | 3% |
| **Total** | **100%** |

All shares are [design]. Switches are concentrated in POS migrations (Square and Toast push switching offers; Square's 2026 "switching" press release is marketing [unverified]). Platform_built_in covers delivery-aggregator and bundled-POS features. Bugs_reliability includes outages during service, which operators remember strongly.

**3. Leading indicators.** Falling transaction counts or covers on the POS. Card declines or a merchant-processing change. Reduced hours or a day closed on the schedule. Delivery-app store pages going dark. Staff turnover (a GM or the owner's partner leaving). Owner's Google review or local news mentioning a sale, lease issue or closure. Support tickets about refunds to closed locations. For groups, one location going quiet first.

**4. Timing.** Closures cluster after lease expiry, after slow seasons (January–February and summer in tourist markets), and after rent or labor cost shocks. For multi-unit groups, churn happens unit by unit. Notice is usually none for a closure and a few days for a payment failure. Annual contracts for POS are uncommon at the independent level, so most churn is monthly.

**5. Save tactics.** Pause plans recover some budget_cut and seasonal cases [design]. A location-level downgrade (drop one unit, keep the rest) saves group accounts better than a whole-account discount. Multi-year or hardware-bundled deals create switching cost. No verified save rates for restaurant SaaS were found. Cancellation-flow offers are mostly discounts (Churnkey's data shows discounts are the most common offer, 62% of offers presented, which is offer frequency, not a save rate) [unverified, https://churnkey.co/blog/voluntary-churn-benchmarks/].

**6. What a solo founder can realistically do.** Build a clean export and a fast offboarding flow, since owners closing a restaurant will leave and may come back. Set up failed-payment retries and card updater. Flag a drop in covers or transactions and reach out with a specific offer (a temporary downgrade or pause). For groups, make location-level billing easy to reduce. Do not chase POS switching fights without a payments or hardware story.

**7. Sources.**
- https://www.nrn.com/independent-restaurants/the-independent-restaurant-sector-shrunk-by-2-3-in-2025 (2026-02-24)
- https://www.businesswire.com/news/home/20260212058106/en/Toast-Announces-Fourth-Quarter-and-Full-Year-2025-Financial-Results (2026-02-12)
- https://fintool.com/app/research/companies/TOST (undated) [unverified]
- https://www.restroworks.com/blog/restaurant-failure-statistics/ (2025) [unverified]
- https://churnkey.co/blog/voluntary-churn-benchmarks/ (2025-12-13)
- https://www.businesswire.com/news/home/20260323084852/en/Why-Leading-Restaurants-are-Switching-to-Square (2026-03-23) [unverified, marketing]

---

## 3. Salons, spas and boutique fitness studios

**1. Churn level.** Closure pressure is real but the public data is anecdotal. Regis (Supercuts, Cost Cutters) has averaged about 50 store closures per quarter in its current fiscal year (article date unclear) [unverified, https://finance.yahoo.com/economy/articles/104-old-national-hair-salon-140700487.html]. A Phorest survey of 1,000 salon owners found 45% had considered closing their salon at some point (undated, likely pre-2025) [unverified]. Boutique fitness: Nike Studios closed all locations after about three years, and F45 franchisee Mad Fitness Group filed Chapter 11 in August 2026 (https://athletechnews.com/f45-franchisee-mad-fitness-group-files-for-chapter-11-bankruptcy/, 2026) [unverified for dates in snippets]. No verified SaaS churn figure exists for Mindbody, Vagaro, Boulevard, or Booksy. Estimated annual logo churn for salon and studio software: 20–35% on monthly plans, 10–15% on annual contracts [design]. Involuntary share, mostly card-on-file failures on memberships: 15–25% [design].

**2. Reason mix (estimated share of cancellations).**

| Reason id | Share |
|---|---|
| price_too_high | 16% |
| switched_competitor | 14% |
| business_closed | 12% |
| champion_left | 10% |
| payment_failed | 7% |
| not_using / low_adoption | 8% |
| bugs_reliability | 6% |
| onboarding_failed | 6% |
| outgrew_product | 6% |
| poor_support | 5% |
| budget_cut | 5% |
| owner_retired_or_sold | 5% |
| **Total** | **100%** |

All shares are [design]. Segment-specific note: champion_left here usually means the stylist, instructor, or studio manager who ran the account, and in booth-rental salons the renter leaving takes their booking calendar and sometimes the seat's subscription with them. Price_too_high reflects per-seat and add-on fees. An anecdotal Capterra review describes Vagaro adding fees for features and an outage that stopped check-in and checkout during business hours [unverified, https://www.capterra.com/p/153752/Vagaro/reviews/?page=18].

**3. Leading indicators.** Booking volume and rebookings down for 4–6 weeks. A stylist or instructor count drop. Failed membership card charges. Unpaid invoices or a shift to cash. Staff leaving, especially a top stylist or a manager who logs in. Reduced hours. Locations closing in a multi-site group. Owner posting about a lease or a rent hike. For studios, class fill rate falling and member count dropping.

**4. Timing.** Churn clusters after the January slump and summer slow season, at annual renewal, and when a lease ends. Booth-rental salons churn when a renter leaves, which can happen any month. Studios churn at membership-cycle end and when a franchise or lease changes. Notice is often a single call or email, sometimes none.

**5. Save tactics.** Pause (for slow seasons) and downgrade (drop a seat or add-on) are the common moves. A seat-based plan that lets the owner remove a departed renter's seat avoids a full churn [design]. Data export and migration help reduce switching cost on the way out. Executive outreach is rarely used at this size. Save rates are not published for this segment; I would not quote one [design].

**6. What a solo founder can realistically do.** Put the champion on your side: make it easy for each stylist or instructor to see their own bookings and clients, so the account survives a departure. Monitor booking volume and card failures weekly. Offer a seat-based plan and a pause option before the owner asks. Keep outages visible and fix booking and checkout reliability first. Build a clean client-data export; migration fear is a real barrier and an easy exit lowers the chance of a bad review.

**7. Sources.**
- https://finance.yahoo.com/economy/articles/104-old-national-hair-salon-140700487.html (undated)
- https://www.capterra.com/p/153752/Vagaro/reviews/?page=18 (reviews dated 2025, undated page) [unverified]
- https://www.goodcall.com/appointment-scheduling-software/mindbody-vs-vagaro (2026-05) [unverified]
- https://athletechnews.com/f45-franchisee-mad-fitness-group-files-for-chapter-11-bankruptcy/ (2026)
- https://athletechnews.com/?p=121480 (Nike Studios closure coverage, 2026) [unverified]
- https://churnkey.co/blog/voluntary-churn-benchmarks/ (2025-12-13)
