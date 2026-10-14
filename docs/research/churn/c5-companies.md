# C5: Why companies cancel or don't renew SaaS, by segment

Research date: 2026-10-14. Tags: [design] = my estimate, not sourced. [unverified] = secondary or vendor source, not checked against the primary document. Dates are publication or data dates where the source gives one.

Evidence caveat: no primary study ranks voluntary cancellation reasons for any of these four segments. The reason-mix tables are [design] estimates anchored to the few sourced data points cited under each heading. Involuntary-churn figures are the most reliable numbers here. Enterprise and procurement figures rest mostly on vendor data.

---

## 1. E-commerce / DTC brands (Shopify apps and stores)

**1. Churn level**
- Recurly benchmark page, July 2026 data, all-industry comparison: ecommerce total churn 4.25%, voluntary 2.87%, involuntary 1.38%. The snippet does not state the period unit, so treat it as a monthly median [unverified]. Involuntary is about 32% of total. https://www.recurly.com/research/churn-rate-benchmarks (accessed 2026-10-14)
- Shopify app churn: a vendor blog claims about 14% of merchants uninstall within 24 hours and about 35% remain at day 90 [unverified]. https://marmeto.com/blogs/news/shopify-app-uninstalls
- Contracts are mostly monthly or annual with no notice period. An uninstall is a single event, so churn has no lead time unless usage signals come first.
- Involuntary share (failed payments): about 30% of total churn for ecommerce on the Recurly figures above. Shopify merchant apps bill through Shopify, so failed-card churn tends to surface as an app-subscription cancellation.

**2. Reason mix (uninstall reasons, [design] estimates)**

Shopify changed the uninstall reason options in April 2026. The new list includes testing multiple apps, store closing or pausing, not using the app, dissatisfaction with features or support, cost, and incompatibility. Developers report that the mandatory prompt gives weak signal and that one developer saw 98% of answers as "testing multiple apps". https://shopify.dev/changelog/update-to-app-uninstall-reasons (2026)

| id | est. share |
|---|---|
| not_using / low_adoption (includes "testing multiple apps") | 22% |
| switched_competitor | 12% |
| business_closed (store closing or pausing) | 12% |
| platform_built_in (Shopify native feature) | 10% |
| price_too_high | 10% |
| missing_feature | 8% |
| payment_failed (plan lapse) | 8% |
| onboarding_failed / never_activated | 6% |
| poor_support / bugs_reliability | 6% |
| consolidated_vendors | 4% |
| owner_retired_or_sold | 2% |
| **Total** | **100%** |

Store closures are a special case. When a merchant schedules a store cancellation, Shopify automatically uninstalls all third-party apps. Those uninstalls are not app-specific choices, and a developer suggests filtering them out [unverified]. https://community.shopify.dev/t/new-uninstall-reason-scheduled-cancellation/33033

**3. Leading indicators**
- Plan downgrade from Shopify Advanced to Basic, or a shift to a lower-cost plan.
- Order or traffic decline over 30 to 60 days.
- No login to the app for 30 days, or setup never completed (never_activated).
- A sales-channel change (for example, moving to a marketplace or to a headless build).
- Shopify announcements covering your feature category.
- Scheduled store cancellation or a "pause" status.

**4. Timing**
- Churn is continuous, with an early-life spike. [design] Most uninstalls likely come early, during testing; the vendor-blog 24-hour and day-90 figures above point the same way. A Shopify developer forum thread asks why uninstalls rose between December and January; it has no measured answer in the snippet I saw [unverified: https://community.shopify.dev/t/why-did-app-uninstalls-increase-between-december-and-january/6222].
- Notice is none to a few days. The app/uninstalled webhook fires the same day, but the reason is visible only in the Partner dashboard event history and is not in the API [unverified: marmeto].

**5. Save tactics and rates**
- No save-rate data found for Shopify apps. [design] Downgrade offers and a pause option likely save more than a discount, since "not using" is the largest reason.
- Cross-segment reference: Churnkey, State of Retention 2025, roughly 3M cancellation sessions. Budget was the top stated reason (33%), and infrequent use was second (31%). Budget often masks product or value problems. https://churnkey.co/reports/state-of-retention-2025
- Switching cost: data sync with the merchant's store, email or ads integrations, and historical data.

**6. What a solo founder can realistically do**
- Subscribe to app/uninstalled and capture the reason with a one-click survey link in the uninstall flow.
- Track activation (first key action within 7 days) and fix onboarding before adding features.
- Check Shopify's native-feature announcements each Edition. An ecommerce blog argues that apps displaced by native features are at risk, but its "60% of depth" claim is unsourced [unverified: https://ecommercefastlane.com/hopify-platform-absorption-app-decision/]. Shopify Editions 2025 did add native features (cart discount codes, Google Ads from the dashboard). These are vendor marketing claims. No merchant churn data was found.
- Move to a multi-store or agency plan to reduce single-store closure risk.

**7. Sources**
- https://marmeto.com/blogs/news/shopify-app-uninstalls
- https://shopify.dev/changelog/update-to-app-uninstall-reasons (2026)
- https://community.shopify.dev/t/new-uninstall-reason-scheduled-cancellation/33033
- https://community.shopify.dev/t/why-did-app-uninstalls-increase-between-december-and-january/6222
- https://community.shopify.com/t/whats-the-biggest-reason-merchants-uninstall-a-shopify-app/660762
- https://www.recurly.com/research/churn-rate-benchmarks (July 2026 data)
- https://churnkey.co/reports/state-of-retention-2025
- https://ecommercefastlane.com/hopify-platform-absorption-app-decision/
- https://ecommercepartners.com/2025/05/22/top-5-shopify-editions-summer-25-features-every-ecommerce-manager-should-know-and-what-to-ask-your-dev-agency/ (May 2025)
- Store-closure failure rates (20 to 40%) appear only in undated Shopify-vendor guides. I did not use them.

---

## 2. Startups and tech SMBs

**1. Churn level**
- Recurly benchmark page, July 2026 data: SaaS total 3.22%, voluntary 2.16%, involuntary 1.06% (monthly, [unverified] unit). Involuntary is about 33% of total. https://www.recurly.com/research/churn-rate-benchmarks
- SMB annual logo churn: 10–14% (attributed to ChartMogul 2025) and 14–22% for ACV under $5K (attributed to Paddle/ProfitWell) [unverified, secondary blogs]. https://userjot.com/blog/saas-churn-rate-benchmarks
- Startup shutdowns: Carta recorded 966 closures of its U.S. customers in 2024, up from 769 in 2023 (TechCrunch, 2025-01-26). https://techcrunch.com/2025/01/26/2025-will-likely-be-another-brutal-year-of-failed-startups-data-suggests
- Reason for startup death: CB Insights (cited secondhand) finds 70% of 431 venture-backed shutdowns ran out of capital, and 43% lacked product-market fit [unverified]. Check CB Insights directly before citing.
- Contracts are mostly monthly or annual self-serve. Annual churn happens at renewal.

**2. Reason mix ([design] estimates, tech SMB, ACV under $25K)**

| id | est. share |
|---|---|
| not_using / low_adoption | 20% |
| budget_cut (cost cutting, layoffs) | 15% |
| business_closed / funding_ended (runway out) | 12% |
| consolidated_vendors | 11% |
| switched_competitor (including AI-native tools) | 9% |
| payment_failed (involuntary) | 9% |
| outgrew_product | 7% |
| price_too_high | 6% |
| champion_left | 4% |
| missing_feature | 4% |
| onboarding_failed | 3% |
| **Total** | **100%** |

AI replacing point tools: a Software Finder survey (1,008 U.S. professionals, reported by MarketingProfs) says 38% of firms canceled or downgraded legacy SaaS in 2025, and 21% replaced legacy tools with AI-native ones [unverified; firm-wide, not startup-only]. https://www.marketingprofs.com/chirp/2025/53966/how-saas-solution-preferences-are-evolving-infographic . Retool (vendor, sells build tools) says 35% of teams already replaced at least one SaaS tool with a custom build [unverified]. https://www.businesswire.com/news/home/20260217548274/en/Retools-2026-Build-vs.-Buy-Report-Reveals-35-of-Enterprises-Have-Already-Replaced-SaaS-With-Custom-Software

Consolidation pressure: Zylo's 2025 SaaS Management Index says average spend per employee was $4,830, up 21.9% year over year, while app count stayed flat. https://zylo.com/news/2025-saas-management-index (Jan 2025)

**3. Leading indicators**
- Headcount drop, layoff news, or a hiring freeze (for the buyer company).
- Seat count decline or login drop for 30 days.
- Founder or CFO change, or a new finance lead who does a tool audit.
- Card or expense-management spend review (Ramp or Brex dashboards show cuts first).
- Runway messaging in investor updates or public job posts being removed.
- Support ticket volume going quiet, which is often worse than a spike.

**4. Timing**
- Involuntary churn: first failed payment, then dunning over about 2 to 4 weeks.
- Voluntary churn peaks at annual renewal and in the first 90 days for self-serve tools.
- Budget season: start of quarter or fiscal year, and after funding rounds close.
- Notice: monthly accounts give none. Annual accounts give 30 to 60 days if the vendor is watching renewals.

**5. Save tactics and rates**
- No primary save-rate source found for tech SMB. [design] Pause or downgrade plans save more accounts than discounts, because the top reason is low adoption.
- Cross-segment: Churnkey's 2025 data (budget 33%, infrequent use 31%) suggests usage-based save offers match the largest reasons. https://churnkey.co/reports/state-of-retention-2025
- RevenueCat (app subscriptions) reports "not enough usage" at 37% and price at 35% of cancellations in 2025 [unverified]. https://www.revenuecat.com/blog/growth/not-enough-usage-churn
- Multi-year deals and integrations (Slack, GitHub, Google Workspace) raise switching cost.

**6. What a solo founder can realistically do**
- Build a usage-decline alert (no login or no key action in 14 days) and reach out before renewal.
- Add a pause option or a downgrade path to avoid "budget" cancellations.
- Offer annual prepay with a lower price for runway-constrained customers.
- Prepare for the AI-replacement risk: have a feature that depends on your data or workflow, not on generic text generation.
- Fix dunning (retry logic, card updater) to recover involuntary churn; this is cheap and high-return.

**7. Sources**
- https://www.recurly.com/research/churn-rate-benchmarks (July 2026)
- https://techcrunch.com/2025/01/26/2025-will-likely-be-another-brutal-year-of-failed-startups-data-suggests (Jan 2025)
- https://userjot.com/blog/saas-churn-rate-benchmarks (secondary)
- https://www.marketingprofs.com/chirp/2025/53966/how-saas-solution-preferences-are-evolving-infographic (2025)
- https://www.businesswire.com/news/home/20260217548274/en/Retools-2026-Build-vs.-Buy-Report-Reveals-35-of-Enterprises-Have-Already-Replaced-SaaS-With-Custom-Software (Feb 2026)
- https://zylo.com/news/2025-saas-management-index (Jan 2025)
- https://www.revenuecat.com/blog/growth/not-enough-usage-churn
- https://churnkey.co/reports/state-of-retention-2025
- https://www.bls.gov/opub/mlr/2007/09/art1full.pdf (older BLS survival research; the 2025-era BLS summary I found is a secondary guide, [unverified])
- https://www.saasmag.com/great-saas-rebundling-buyers-slashing-vendor-count/

---

## 3. Mid-market companies (about 500 to 5,000 employees)

**1. Churn level**
- Estimates cluster at 6–15% annual logo churn, with 7–12% called healthy [unverified, secondary blogs citing ChartMogul-style benchmarks]. https://meltingspot.io/en/blog/saas-b2b-churn-rate-benchmark
- Involuntary share: low for annual invoiced contracts (invoice terms, not card charges). [design] Involuntary is 5 to 10% of logo churn here.
- Contract structure: annual or multi-year, usually invoiced, with auto-renewal clauses and a notice window of 30 to 90 days.
- Mid-market buyers typically run 100 or more SaaS tools. A Torii 2026 benchmark, as summarized in a Cloud Magazin article, puts firms with 1,500–4,999 employees at an average of 101 tools, down from two years earlier, while total SaaS spend rose 8% [unverified; primary Torii report not retrieved]. https://www.cloudmagazin.com/en/2026/02/25/saas-consolidation-how-cios-are-taming-the-tool-jungle/

**2. Reason mix ([design] estimates)**

| id | est. share |
|---|---|
| consolidated_vendors | 18% |
| budget_cut | 14% |
| champion_left | 13% |
| switched_competitor | 11% |
| acquired_or_merged | 9% |
| not_using / low_adoption | 9% |
| missing_feature | 7% |
| outgrew_product | 6% |
| onboarding_failed | 4% |
| contract_term_end_rfp (forced rebid) | 4% |
| security_or_compliance | 3% |
| moved_to_in_house | 2% |
| **Total** | **100%** |

Champion departure: a ChurnZero article (excerpt on an aggregator site) says a churn within 12 months is about 51% likely after a champion leaves, and that 65% of accounts with an executive change don't renew [unverified; secondhand]. https://churnzero.com/blog/customer-churn-risks-2025-monsters . A fractional-CRO page cites an uncheckable Gartner figure (renewal probability falls from about 85% to 50%) [unverified; do not cite].

**3. Leading indicators**
- Champion LinkedIn change or departure (check every 30 days).
- Executive change (new CFO or CIO), which ChurnZero links to non-renewal.
- Seat decline at a QBR, or a drop in active users below 60% of licenses.
- Missed invoices or a PO that is slow to issue.
- Support tickets that go unanswered for 3+ days, or an escalation.
- Budget-season signals: procurement requests for "vendor review" or a consolidation project.

**4. Timing**
- Churn clusters at the renewal date, and in the 60 to 90 days before it (when the buyer decides not to renew).
- Fiscal-year end (often December or June) and budget planning in Q3 and Q4 are the peak windows for consolidation decisions.
- Notice: 60 to 90 days if the vendor is tracking. Without a champion, the vendor often gets no notice.

**5. Save tactics and rates**
- Executive sponsor outreach within 48 hours of a champion change: ChurnZero claims that makes renewal 33% more likely [unverified].
- Quarterly business reviews with a shared success plan: [design] save rates unknown, but these are the main tool for consolidation defense.
- Multi-year deal with price lock: lowers churn at renewal, but shifts risk to the buyer's next budget cycle.
- Integrations with the buyer's core stack (ERP, HRIS, CRM) raise switching cost and are the best defense against consolidation.

**6. What a solo founder can realistically do**
- Build a champion map: at least two contacts per account (user and economic buyer).
- Run a QBR on the renewal calendar, 90 days before each renewal.
- Track seats and logins monthly, with a red-flag rule.
- Offer multi-year terms with a price cap instead of discounts.
- Avoid RFPs unless the deal is large enough to justify the cost.

**7. Sources**
- https://churnzero.com/blog/customer-churn-risks-2025-monsters
- https://meltingspot.io/en/blog/saas-b2b-churn-rate-benchmark
- https://zylo.com/news/2025-saas-management-index (Jan 2025)
- https://www.cloudmagazin.com/en/2026/02/25/saas-consolidation-how-cios-are-taming-the-tool-jungle/ (Feb 2026)
- https://www.saasmag.com/great-saas-rebundling-buyers-slashing-vendor-count/
- https://www.forrester.com/blogs/migration-planning-10-steps-to-retire-old-offerings-and-keep-your-customers/ (sunset planning, undated)

---

## 4. Fortune 500 enterprise

**1. Churn level**
- Enterprise annual logo churn of 2–5% (ChartMogul 2025, attributed by a secondary blog) [unverified]. https://userjot.com/blog/saas-churn-rate-benchmarks . Another secondary source gives 3.2% for contracts above $50K ACV [unverified].
- Revenue churn is lower than logo churn because big accounts stay. Vertical-SaaS S-1s show high retention for trades customers: ServiceTitan reports gross dollar retention above 95% and net above 110% [sourced to S-1 excerpts via SaaS Capital and Meritech; methodology excludes small accounts]. https://www.sec.gov/Archives/edgar/data/1638826/000119312524260611/d577298ds1.htm . These are not Fortune 500 figures.
- Renewal pricing: Vendr's 2025 report (15,817 transactions, Jan 2024 to Mar 2026) says median renewal price fell about 8%, from $27K to $24K, while median new-deal size fell about 43%, from $11K to $6K. https://www.vendr.com/resources/trends-report [unverified: report is gated; figures from the summary]
- Involuntary churn: near zero. Enterprise invoices are paid by AP. Recurly's $250+ ARPC cohort shows 0.18% involuntary churn, but that is a consumer-subscription cohort [unverified]. https://www.recurly.com/research/churn-rate-benchmarks

**2. Reason mix ([design] estimates, for a company that is a current vendor of a Fortune 500 buyer)**

| id | est. share |
|---|---|
| contract_term_end_rfp (forced rebid at renewal) | 22% |
| consolidated_vendors | 20% |
| budget_cut / procurement cost-cutting | 15% |
| acquired_or_merged (buyer M&A) | 10% |
| champion_left | 8% |
| switched_competitor | 8% |
| moved_to_in_house | 5% |
| security_or_compliance | 4% |
| missing_feature | 3% |
| not_using / low_adoption | 3% |
| poor_support | 1% |
| regulation_change | 1% |
| **Total** | **100%** |

Supporting data: Flexera (citing BetterCloud's SaaS Management Index) says enterprises cut SaaS applications by 18% in 2025, and 82% are actively consolidating vendors [unverified]. https://www.flexera.com/solutions/financial-services . A Gartner 2025 survey figure (68% of CIOs rank vendor consolidation top three, targeting about 20% fewer providers) is attributed only through a secondary blog [unverified]. https://www.saasmag.com/great-saas-rebundling-buyers-slashing-vendor-count/

Forced exits from a vendor's own change: the Broadcom/VMware case. A CloudBolt survey (January 2026, n=302 North American IT leaders at companies with 1,000+ employees) found 4% had fully replaced VMware, 86% were reducing use, and 59% saw price increases of 25–49% [unverified; CloudBolt sells migration tools]. https://www.channelinsider.com/infrastructure/cloudbolt-vmware-survey-reducing-usage/ . This is the pattern to expect when a vendor raises prices at renewal: partial reduction, not full exit.

**3. Leading indicators**
- RFP notice from procurement (often 6 to 12 months before term end).
- Vendor-risk or "tool rationalization" project announced internally.
- Acquisition announcement by the buyer or by you (acquirer will review duplicate tools).
- Executive sponsor change, or a new CIO, CFO or CPO.
- Usage drop on license-true-up reports.
- Procurement moves the account to a sourcing team or a "Vendr" or "Zylo"-style review.

**4. Timing**
- Churn is decided at the renewal date and at the RFP award, which often falls 3 to 9 months before the term ends.
- Fiscal-year ends (many F500s end in December, some in June or September) are budget lock points.
- Notice: 90 to 180 days in most large contracts, often less if procurement moves early.

**5. Save tactics and rates**
- No save-rate data found for F500 renewals. [design] Early executive engagement (9 months before term end) and multi-year terms with price caps have the strongest effect.
- Integrations and data-residency commitments create switching costs that survive RFPs.
- Vendr's data shows buyers keep investments but shop for smaller new deals [unverified]. Expect to lose new-logo deals to lower-priced point tools and to keep renewals if you are embedded.

**6. What a solo founder can realistically do**
- Realistically, avoid Fortune 500 direct sales unless you can pass security review (SOC 2 Type II, SSO, DPA). Those take 6 to 12 months and cost real money.
- If you have an enterprise customer already, track its renewal date, RFP calendar and M&A news. Start the renewal conversation 6 months early.
- Sell through a reseller, partner, or a business unit below the procurement threshold, where the approval path is shorter.
- Plan for M&A: have a data-export and migration path, and a list of acquirer overlaps before the acquirer's review starts.

**7. Sources**
- https://www.vendr.com/resources/trends-report (2025 data, gated)
- https://www.sec.gov/Archives/edgar/data/1638826/000119312524260611/d577298ds1.htm (ServiceTitan S-1, FY2024)
- https://www.servicetitan.com/press/servicetitan-fiscal-fourth-quarter-results-fy2025 (FY2025 results)
- https://www.saas-capital.com/blog-posts/how-to-have-a-95-gross-revenue-retention-selling-saas-to-small-businesses/ (secondary commentary)
- https://www.flexera.com/solutions/financial-services (2025)
- https://www.saasmag.com/great-saas-rebundling-buyers-slashing-vendor-count/
- https://www.channelinsider.com/infrastructure/cloudbolt-vmware-survey-reducing-usage/ (Jan 2026)
- https://www.forrester.com/blogs/migration-planning-10-steps-to-retire-old-offerings-and-keep-your-customers/
- https://www.recurly.com/research/churn-rate-benchmarks (July 2026)
- https://www.getmonetizely.com/articles/what-is-vendor-consolidation-in-saas-understanding-enterprise-portfolio-optimization-in-2024 (2024; background only)
