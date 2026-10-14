# Churn reasons by segment: trades, construction, trucking (C2)

Conventions: [design] = my estimate, not sourced. [unverified] = secondary or vendor source, or a search snippet I did not open. Dates are the publication or period dates shown in the source. No public logo-churn disclosure exists for any of these three segments, so most reason mixes below are [design] estimates anchored to the proxies cited.

---

## 1. Trades and specialty subcontractors (roofing, HVAC, plumbing, electrical)

**Churn level**
- No public logo churn for trades-focused software. The closest disclosed proxy is ServiceTitan's gross dollar retention (GDR) above 95% in each of its last 10 quarters, calculated only on active customers with more than $10K annualized billings (S-1, period ended July 31, 2024: https://www.sec.gov/Archives/edgar/data/1638826/000119312524260611/d577298ds1.htm). SaaS Capital calls 95% "almost unbelievably high" for building trades and says 75–80% GRR is strong for small-business software. It notes that a 95% quarterly figure compounds to about 81.5% annually, and that ServiceTitan's method excludes downgrades (https://www.saas-capital.com/blog-posts/how-to-have-a-95-gross-revenue-retention-selling-saas-to-small-businesses/, Dec 10, 2024).
- Generic SMB SaaS: 3–7% monthly and 30–58% annual logo churn, citing an Optifai 2026 study (N=939) [unverified] (https://stealthagents.com/research/saas-churn-rate-statistics-2026, 2026). Annual contracts run about 1–2% monthly versus 3–6% for month-to-month [unverified] (https://userjot.com/blog/saas-churn-rate-benchmarks).
- My estimate for trades SMB tools on monthly plans: 3–5% monthly logo churn, 30–45% annual [design]. Annual-prepay plans: about 1.5–2.5x lower [design].
- Involuntary churn: Stripe and Churnkey data (2024 activity, published Nov 14, 2025) put it at 22% of all SaaS churn and 16% for B2B. For average order values of $30–100 it is 26%, and under $10 it is 35% (https://churnkey.co/blog/involuntary-churn-benchmarks). Trades plans are small and card-on-file, so I estimate 15–25% of churn [design].

**Reason mix** [design, no direct data]

| id | share |
|---|---|
| business_closed | 14% |
| payment_failed | 14% |
| seasonal_pause | 10% |
| not_using / low_adoption | 12% |
| price_too_high | 9% |
| switched_competitor | 8% |
| onboarding_failed / never_activated | 8% |
| owner_retired_or_sold | 6% |
| missing_feature | 6% |
| bugs_reliability | 4% |
| poor_support | 3% |
| consolidated_vendors | 3% |
| outgrew_product | 3% |

**Leading indicators**
- Invoices sent per week falling for two or more weeks, or fewer scheduled jobs.
- Logins dropping to near zero for 14 or more days outside a known busy season.
- Card retry failures, or a card-on-file that expires.
- Technician seat count falling (a field-service vendor's seats track techs).
- Owner posts about a slow season, or lead-gen spend pausing.
- Chapter 7 or closure news in a local market, which is public.

**Timing**
- Churn is monthly, not at renewal, so it arrives without a notice period. Cancellations cluster in the winter off-season for roofing and HVAC cooling work [design]. Onboarding failures cluster in the first 90 days.
- Vendor notice: usually none, or at most a few days when the owner cancels online. Involuntary churn gives the vendor a dunning window of about 1–3 weeks [design].

**Save tactics**
- Seasonal pause: a plan that holds the account for 1–3 months at a low fee. Save rate unknown. My estimate is that it converts 20–40% of would-be seasonal cancels [design].
- Account credits for reactivation are used by at least one contractor-software vendor, Contractor+ (https://support.contractorplus.app/en/articles/11429067-how-to-cancel-your-contractor-membership, date not shown) [unverified].
- Dunning and card updater recover a large part of involuntary churn. Vendor claims are mostly marketing; I did not verify a rate.
- Annual prepay and multi-year deals reduce churn [design].
- Integrations (QuickBooks, Google Calendar, a phone system) raise switching cost.

**What a solo founder can realistically do**
- Ship a seasonal pause and a 1-click reactivation before anything else.
- Add dunning with retries and card-updater, which is cheap and usually the biggest single fix for involuntary churn.
- Offer annual prepay at a discount, and onboard in the first 14 days with a data import.
- Price per technician so the bill falls when a crew shrinks, and track seat counts weekly.
- Avoid chasing enterprise trades platforms, where ServiceTitan's scale and integrations set the bar.

**Sources**
- https://www.sec.gov/Archives/edgar/data/1638826/000119312524260611/d577298ds1.htm (ServiceTitan S-1, FY2024 period ended July 31, 2024)
- https://www.saas-capital.com/blog-posts/how-to-have-a-95-gross-revenue-retention-selling-saas-to-small-businesses/ (Dec 10, 2024)
- https://churnkey.co/blog/involuntary-churn-benchmarks (Nov 14, 2025, updated Dec 12, 2025)
- https://stealthagents.com/research/saas-churn-rate-statistics-2026 (2026) [unverified]
- https://userjot.com/blog/saas-churn-rate-benchmarks (2025) [unverified]
- https://support.contractorplus.app/en/articles/11429067-how-to-cancel-your-contractor-membership [unverified]
- https://www.capterra.com/p/140363/HouseCall-Pro/ (2026, review aggregate only)

---

## 2. General contractors and mid-size construction firms

**Churn level**
- Procore (enterprise-leaning construction platform): gross revenue retention 95% and net revenue retention 106% for FY2025, from the preliminary Q4 release dated Feb 12, 2026 (https://www.businesswire.com/news/home/20260212491358/en/). This is a much larger, multi-module customer base than a GC office tool, so treat it as a ceiling.
- Motive (fleet and field-service software, Sept 30, 2025 S-1 data): net dollar retention 109–110% for Core customers (ARR above $7,500) and 125–126% for Large (above $100K) (https://www.sec.gov/Archives/edgar/data/1646681/000162828025058773/motive-sx1.htm; https://tomtunguz.com/motive-s-1/). NDR is net of churn, so it does not isolate churn.
- Construction firm survival (BLS-based cohorts, via eSub): 46.2% of firms founded 1996–97 reached year 5, versus 59.3% of firms founded 2016–17 [unverified] (https://esub.com/blog/construction-business-software, date not shown). The SBA all-industry five-year survival was 48.9% for 1994–2019 launches [unverified].
- My estimate for small GC software on annual contracts: 15–25% annual logo churn, with monthly plans at 2–4% per month [design]. Involuntary churn: 10–15% of churn [design], below the trades figure because GC accounts are invoiced and larger.

**Reason mix** [design, no direct data]

| id | share |
|---|---|
| project_completed_no_renewal (segment-specific) | 14% |
| switched_competitor (Procore, Buildertrend, Autodesk) | 12% |
| business_closed | 12% |
| consolidated_vendors | 10% |
| budget_cut | 7% |
| acquired_or_merged | 8% |
| champion_left | 8% |
| missing_feature | 8% |
| onboarding_failed / never_activated | 6% |
| price_too_high | 6% |
| poor_support | 5% |
| payment_failed | 4% |

On switching: an Autodesk reseller says cost and workflow fit drive Procore-to-ACC moves, and it is promotional [unverified] (https://resources.imaginit.com/building-solutions-blog/why-organizations-are-switching-from-procore-to-autodesk-construction-cloud-acc, date not shown). A Churnkey case study shows Buildertrend routing cancellations through a survey flow, but it publishes no reason breakdown (https://churnkey.co/case-studies/buildertrend/).

**Leading indicators**
- Active projects dropping, or no new project created in 60 days.
- Project-manager logins per project falling.
- Project closeouts with no follow-on job scheduled.
- Champion (PM or ops director) changes jobs, visible on LinkedIn.
- Acquisition or merger news for the customer.
- Bid volume falling, if the tool tracks bids.

**Timing**
- Churn clusters at project completion and at the calendar or fiscal year-end. Many GCs review software spend in Q4 and Q1 [design].
- Notice: 60–90 days through a procurement or budget cycle [design]. Involuntary churn gives roughly a 1–3 week dunning window.

**Save tactics**
- Multi-year deals, tied to a set number of projects or a portfolio.
- Pricing per active project so the bill falls when work pauses. Save rates unknown.
- Executive sponsor outreach to the owner at closeout.
- A second champion in accounting. Integration with accounting systems (QuickBooks, Sage) is a strong switching cost [design].

**What a solo founder can realistically do**
- Price per active project, not per seat, and let accounts pause between jobs.
- Get a second champion, usually in accounting, before the PM leaves.
- Track project count monthly, since a fall in active projects is the best early warning.
- Skip formal RFPs. They are a churn trigger at the contract-term end and a poor use of a solo founder's time.

**Sources**
- https://www.businesswire.com/news/home/20260212491358/en/ (Procore FY2025 results, Feb 12, 2026)
- https://www.sec.gov/Archives/edgar/data/1646681/000162828025058773/motive-sx1.htm (Motive S-1, data to Sept 30, 2025)
- https://tomtunguz.com/motive-s-1/ (2025)
- https://esub.com/blog/construction-business-software (date not shown) [unverified]
- https://www.zenbusiness.com/blog/startup-business-survival-rate/ (date not shown) [unverified]
- https://churnkey.co/case-studies/buildertrend/ (date not shown)
- https://resources.imaginit.com/building-solutions-blog/why-organizations-are-switching-from-procore-to-autodesk-construction-cloud-acc (date not shown) [unverified]

---

## 3. Logistics and trucking fleets

**Churn level**
- No public logo churn for fleet software. Motive's Core NDR is 109–110% and Large NDR is 125–126% as of Sept 30, 2025 (https://www.sec.gov/Archives/edgar/data/1646681/000162828025058773/motive-sx1.htm). Samsara's FY26 target for core-customer NRR is about 115% (plus or minus 2), per its Q4 FY25 letter as reported by TipRanks (https://www.tipranks.com/news/the-fly/samsara-sees-q1-annual-recurring-revenue-down-from-q4, date not shown) [unverified]. Samsara's gross retention was not found in my searches.
- Carrier exits are the real driver for small fleets. FreightWaves SONAR puts net revocations at about 838 per week as of May 15, 2026, about 30% below the 2025 weekly average, and most May 2026 filings were fleets of fewer than 10 trucks. The same source also says the pace is 31% above the same period in 2025, which conflicts with the first figure (https://www.freightwaves.com/news/fmcsa-removes-five-elds-warns-fleets-to-switch-by-dec-16, 2026) [unverified].
- FMCSA revoked 24 ELDs in 2025 by mid-year, the most since 2018. Vendors that lose approval force fleets to switch (https://www.freightwaves.com/news/fmcsa-pulls-three-more-elds-from-the-approved-list, 2025) [unverified].
- Epiq AACER, H1 2026: total US filings up 12%, commercial Chapter 11 up 28% (https://www.abfjournal.com/epiq-total-bankruptcy-filings-increase-12-in-h1-26/, 2026).
- My estimate for small-carrier SaaS: 3–6% monthly logo churn, 25–45% annual [design]. For fleets above 50 units: 5–10% annual [design]. Involuntary churn: 15–25% of churn, anchored to the Stripe B2B figure of 16% [design].

**Reason mix** [design, no direct data]

| id | share |
|---|---|
| business_closed (carrier shuts or loses authority) | 24% |
| payment_failed | 10% |
| price_too_high | 9% |
| switched_competitor | 8% |
| acquired_or_merged (carrier bought, fleet folded) | 7% |
| not_using / low_adoption | 6% |
| consolidated_vendors (TMS bundling) | 6% |
| bugs_reliability (device outages) | 6% |
| onboarding_failed / never_activated | 6% |
| owner_retired_or_sold | 6% |
| poor_support | 5% |
| missing_feature | 4% |
| regulation_change (forced ELD swap, counted as churn for the old vendor) | 3% |

On vendor-driven churn, a CCJ article says Trimble TruckMate support has lagged as attention moves to TMW.Suite, and it ties switching questions to a rumored sale of Trimble's T&L unit (https://www.ccjdigital.com/business/mergers-acquisitions/article/15830985/why-trimble-would-consider-selling-tl-unit, date not shown) [unverified].

**Leading indicators**
- Active units or drivers falling, which hits seat-based bills. A parked truck is a seat signal.
- Telematics devices going offline for more than 7 days.
- Driver turnover rising.
- FMCSA authority revocation or a "not authorized" status, which is public and can be checked against the account list.
- Owner moving from several trucks to one.
- Factoring company changes or unpaid invoices.

**Timing**
- Churn follows freight-market cycles. The 2026 downturn has run more than three years [unverified].
- Small carriers often vanish without notice. Mid-size fleets usually give 60–90 days through a renewal or device-lease end, and hardware leases of about 36 months create a natural renewal point [design].

**Save tactics**
- Per-unit pricing that falls when a truck is parked.
- Hardware leases tied to contract length. This is a strong switching cost and often the main reason fleets stay.
- Payment plans for a carrier in trouble.
- Downgrading to fewer modules.
- Save rates unknown.

**What a solo founder can realistically do**
- Per-unit pricing with a parked-unit credit.
- Monitor FMCSA authority status for every account. It is public data, and a revocation is a warning you can act on before the cancellation.
- Sell to mid-size fleets and owner-operators with a clear lease or contract structure, not to the thin tail of one-truck carriers, which the 2026 data shows is where closures concentrate.
- Avoid ELD or TMS bundling fights with Samsara, Motive, or Trimble.

**Sources**
- https://www.sec.gov/Archives/edgar/data/1646681/000162828025058773/motive-sx1.htm (Motive S-1, Sept 30, 2025 data)
- https://tomtunguz.com/motive-s-1/ (2025)
- https://www.tipranks.com/news/the-fly/samsara-sees-q1-annual-recurring-revenue-down-from-q4 (Samsara Q4 FY25, date not shown) [unverified]
- https://www.freightwaves.com/news/fmcsa-removes-five-elds-warns-fleets-to-switch-by-dec-16 (2026) [unverified]
- https://www.freightwaves.com/news/fmcsa-pulls-three-more-elds-from-the-approved-list (2025) [unverified]
- https://www.ccjdigital.com/business/mergers-acquisitions/article/15830985/why-trimble-would-consider-selling-tl-unit (date not shown) [unverified]
- https://www.abfjournal.com/epiq-total-bankruptcy-filings-increase-12-in-h1-26/ (2026)
- https://churnkey.co/blog/involuntary-churn-benchmarks (Nov 14, 2025)
