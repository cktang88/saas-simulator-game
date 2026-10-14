# C7: Churn in education, nonprofits, and churches (late 2026)

Research note. Hard churn numbers for these segments are scarce. Most figures below are either secondary/vendor sources marked [unverified], or estimates marked [design]. Dates are the publication or search-visible dates given by the source.

---

## Segment 1: K-12 school districts

### 1. Churn level
- **Annual logo churn:** [design] 15-25% for SaaS sold to district central offices in 2025-26, the post-ESSER year. Teacher-adopted or school-level tools churn higher, roughly 30-50% a year, because they often lapse silently.
- **Annual revenue churn:** [design] 10-15%. Large districts are sticky, but a single district non-renewal removes a large contract at once.
- **Benchmark context:** A 2025 Lighter Capital dataset (155 private B2B SaaS startups, 2020-2024 data) reportedly shows education-vertical customer churn doubling from 11% (2024) to 22% (2025) [unverified, secondary citation via WeAreFounders; the 22% figure was not visible on Lighter's own page in my search]. Lighter's overall median revenue churn rose from 11.34% to 12.50% [unverified].
- **Contract type:** Districts sign annual order forms. Monthly plans are mostly teacher-paid. Vendor policy example: Speakable's district plans are billed annually, do not auto-renew unless the order form says so, and need written cancellation 30 days before renewal [unverified, one vendor's policy].
- **Involuntary churn:** [design] 1-2% of district revenue (purchase orders rarely fail). For teacher-paid or school-card plans, 5-10% of churn can be failed cards.

### 2. Reason mix (estimated shares)
| Reason id | Share | Note |
|---|---|---|
| budget_cut | 22% | General-fund reduction, staff cuts |
| funding_ended | 18% | ESSER or grant-funded line item ends |
| consolidated_vendors | 16% | Tool inventory cleanup (see below) |
| not_using / low_adoption | 14% | Low usage per school |
| champion_left | 8% | Curriculum director or superintendent change |
| contract_term_end_rfp | 8% | Forced rebid or board-approved RFP |
| switched_competitor | 5% | Bundled or cheaper alternative |
| platform_built_in | 4% | LMS or Google/Microsoft bundling |
| price_too_high | 3% | |
| acquired_or_merged | 2% | Vendor acquired, product sunset |

Total: 100%. All shares [design]. Supporting context: Denver Public Schools cut digital tools from more than 1,000 to 346, saving about $1M, and reviews all apps every two years (EdWeek, July 2025, https://www.edweek.org/technology/how-this-district-cut-hundreds-of-ed-tech-tools-and-saved-1m/2025/07). Oklahoma City narrowed to 250 approved apps (same source family). LearnPlatform data shows districts averaged 2,982 tools in 2024-25, up from 2,739 (Instructure, 2025, cited in search results) [unverified].

### 3. Leading indicators
- Usage down in a school or grade for two or more months (logins, active teachers per school).
- Superintendent, curriculum director, or CTO change. Check LinkedIn and board minutes.
- State ESSER or grant spending reports that show the vendor's line item ending.
- Board agenda items about "software inventory," "tool review," or "budget reduction."
- Teacher community complaints about an app going on hold (Kami forum example: a teacher found the app on hold after the district stopped buying it, https://community.kamihq.com/t/i-think-my-school-is-not-renewing-kami/5750).
- Shift of a tool onto a teacher's personal card (a sign the district stopped paying).

### 4. Timing
- Many districts use a July 1 to June 30 fiscal year (district policy examples, e.g., Cabot School District, https://cabotschools.org/storage/files/shares/District%20Policies/2026-2027/SEC%207%20-%20BUSINESS%20AND%20FINANCE%20-%20FINAL%202025.pdf). Renewal decisions cluster from late winter to June.
- ESSER III liquidation ended with a March 28, 2026 final deadline after 2025 reversals and litigation (The Journal, 31 March 2025, https://thejournal.com/articles/2025/03/31/ed-abruptly-cancels-esser-funding-extensions.aspx; EdWeek Market Brief summary, 2026 [unverified on final date]).
- Board approval thresholds (one district uses $10,000 or more) can add 30-60 days to a renewal [unverified, single district].
- Vendor notice: [design] 0-3 months, often less. Teacher-adopted tools may vanish with no notice.
- Churn spikes: June-August and January-February (budget revisions).

### 5. Save tactics
- **Multi-year deal with a locked price,** before the board budget vote. [design] Works often, about 40-60% of at-risk accounts, when offered before budget adoption.
- **Bridge or reduced-price year** tied to a usage plan. [design] Saves about 30-40% of accounts facing cuts.
- **Move funding source:** help the champion relabel the spend to Title I, Title IV, or general fund (the Civic IQ blog reports districts re-buying from operating budgets, e.g., a June 2026 renewal batch in Minnesota [unverified]).
- **LMS or SIS integration** (rostering, single sign-on). [design] Raises switching cost.
- **Free-tier fallback:** teachers keep a free version when the district stops paying (Kami has a free plan, per the forum). This can reduce loss but also reduces revenue.
- **Executive or champion outreach** before the superintendent's budget memo.

### 6. What a solo founder can realistically do
- Build a renewal calendar by district fiscal year, starting at February for July 1 renewals.
- Track usage per school and send principals a monthly usage summary. Simple, effective.
- Offer a cheaper "essentials" tier that fits a general-fund line item under the board threshold.
- Find a teacher or curriculum champion who will defend the tool at the budget hearing.
- Avoid heavy dependence on ESSER-funded districts; check which districts are on grant money before selling.
- Expect long sales cycles and small deals. Consider the work before entering the segment (see also the selling-to-segments sections in the wider brief).

### 7. Sources
- EdWeek, "How this district cut hundreds of ed-tech tools and saved $1M," July 2025: https://www.edweek.org/technology/how-this-district-cut-hundreds-of-ed-tech-tools-and-saved-1m/2025/07
- EdSurge, "Trimming the Edtech Fat," 16 May 2025: https://edsurge.com/news/2025-05-16-trimming-the-edtech-fat-how-districts-are-streamlining-their-digital-ecosystems
- The Journal, "ED Abruptly Cancels ESSER Funding Extensions," 31 March 2025: https://thejournal.com/articles/2025/03/31/ed-abruptly-cancels-esser-funding-extensions.aspx
- Khan Academy, "Are ESSER Funds Still Available?": https://blog.khanacademy.org/are-esser-funds-still-available/
- Civic IQ, "ESSER budget cliff K-12 edtech" (2026 date per search summary, unverified): https://civiciq.com/blog/esser-budget-cliff-k12-edtech
- Lighter Capital, 2025 B2B SaaS benchmarks: https://www.lightercapital.com/blog/2025-b2b-saas-startup-benchmarks
- WeAreFounders, SaaS churn by industry (2025 data): https://www.wearefounders.uk/saas-churn-rates-and-customer-acquisition-costs-by-industry-2025-data/
- Speakable cancellation policy (vendor policy example): https://www.speakable.io/policies/cancellation-policy
- Kami community forum: https://community.kamihq.com/t/i-think-my-school-is-not-renewing-kami/5750

---

## Segment 2: Colleges and universities

### 1. Churn level
- **Annual logo churn:** [design] 8-15% for SaaS sold to colleges, with more churn in departmental tools than in campus-wide contracts.
- **Annual revenue churn:** [design] 5-10%. Campus-wide contracts are sticky; department-level tools churn more.
- **Involuntary churn:** [design] about 1%. Institutions pay by invoice or purchase order, so card failure is rare.
- **Market context:** Higher-ed trade analysis (Dec 2025) says rising costs push institutions to consolidate vendors and demand clearer ROI before renewing [unverified, newsletter]. No aggregate higher-ed non-renewal rate was found.

### 2. Reason mix (estimated shares)
| Reason id | Share | Note |
|---|---|---|
| consolidated_vendors | 20% | Campus-wide platform consolidation |
| budget_cut | 16% | Salary inflation squeezes discretionary budgets |
| champion_left | 14% | CIO, provost, or department head change |
| not_using / low_adoption | 13% | Department tool with low faculty uptake |
| acquired_or_merged | 8% | Vendor acquisitions (Ellucian and Anthology, 2025-26) |
| switched_competitor | 8% | |
| contract_term_end_rfp | 7% | Procurement requires competitive bid |
| missing_feature | 5% | |
| security_or_compliance | 4% | Vendor fails security review or VPAT |
| outgrew_product | 3% | |
| platform_built_in | 2% | LMS or ERP bundling |

Total: 100%. All shares [design]. Acquisition context: Ellucian closed its Anthology SIS and ERP acquisition at the end of 2025, adding 260 customers (https://erp.today/ellucian-completes-anthology-sis-and-erp-acquisition-adding-260-higher-education-customers/) [unverified, vendor-press]. Anthology's enrollment business went to Encoura in early 2026 [unverified].

### 3. Leading indicators
- Vendor acquired or product line sunset announcement.
- New CIO or provost; a new strategic plan.
- Campus-wide procurement review or an RFP notice on public procurement sites.
- Declining enrollment or net tuition revenue (institutions with flat or falling tuition push harder on renewals [unverified]).
- Low login counts from departments outside the initial champion's group.
- Security questionnaire (HECVAT or VPAT) that stalls or is re-requested.

### 4. Timing
- Many public universities run July 1 fiscal years, so renewals cluster in spring and early summer. A university renewal guide warns that late paperwork can push approvals past July 1 (analogy, https://www.cu.edu/print/blog/psc-communicator/concur-travel-and-expense-renewal) [unverified].
- Academic-year contracts start August or September. Renewal decisions run January to May.
- Vendor notice: [design] 60-120 days typical for an RFP-driven loss. Departmental tools can disappear mid-year.

### 5. Save tactics
- **Renewal review with user survey.** The University of Colorado renewed a SAP Concur contract for three years in 2024 after market research and a customer survey, and concluded switching costs outweighed benefits (https://www.cu.edu/print/blog/psc-communicator/concur-travel-and-expense-renewal). Pattern: a documented user survey wins renewals [design estimate of save rate: 35-50% when a survey is done before renewal].
- **Multi-year price lock** with billing aligned to the academic year.
- **Integration with SIS or LMS** (single sign-on, roster sync). [design] Raises switching cost.
- **Pilot-to-campus expansion:** department pilot that becomes campus-wide.
- **Faculty champion** who presents usage data to the committee.

### 6. What a solo founder can realistically do
- Sell to departments with discretionary budgets and purchasing cards that stay below the RFP threshold. Avoid campus-wide deals until you have a VPAT and HECVAT.
- Align billing and renewal dates to the academic calendar.
- Give champions a one-page usage report they can show their dean.
- Watch acquisitions in the sector. A product in an acquirer's catalog faces a high risk of consolidation.

### 7. Sources
- Higher Education Executive Intelligence (Substack), cost inflation and vendor consolidation, Dec 2025: https://higheredintel.substack.com/p/cost-inflation-pressures-campuses
- Erp.today, Ellucian and Anthology SIS/ERP acquisition: https://erp.today/ellucian-completes-anthology-sis-and-erp-acquisition-adding-260-higher-education-customers/
- Enrollify, higher-ed technology consolidation trends: https://www.enrollify.org/blog/higher-ed-technology-consolidation-trends-strategy
- University of Colorado, Concur renewal post (2024): https://www.cu.edu/print/blog/psc-communicator/concur-travel-and-expense-renewal
- University of Salford Mentimeter renewal review: https://www.contractsfinder.service.gov.uk/Notice/21078505-3f30-4283-a47d-b42d4a5dade1 (renewal review notice, Feb 2025 [unverified])
- Civic IQ, ESSER budget cliff (K-12 analogy): https://civiciq.com/blog/esser-budget-cliff-k12-edtech

---

## Segment 3: Nonprofits and associations

### 1. Churn level
- **Annual logo churn:** [design] 15-25% for small and mid nonprofits (under $5M budget). Associations with dues-based membership are steadier, at 10-15%.
- **Annual revenue churn:** [design] 10-20%. Small nonprofits go under or cut staff, so logo churn tracks budget stress.
- **Involuntary churn:** [design] 3-6%. Donation-funded organizations with cards on file see more failed payments, and donor-funded cash flow is volatile.
- **Context:** A 2025 Urban Institute/Chronicle of Philanthropy survey found 21% of nonprofits that lost government funding had a grant or contract end, and 29% of those hit had reduced staff (https://www.philanthropy.com/article/a-third-of-u-s-nonprofits-that-serve-communities-lost-government-funding-in-early-2025) [unverified, secondary summary].

### 2. Reason mix (estimated shares)
| Reason id | Share | Note |
|---|---|---|
| budget_cut | 24% | Operating budget reduction, staff cuts |
| funding_ended | 22% | Grant or government contract ended |
| not_using / low_adoption | 12% | Staff turnover leaves tool unused |
| price_too_high | 8% | Per-seat cost against a shrinking team |
| champion_left | 7% | Executive director or operations lead leaves |
| platform_built_in | 6% | Microsoft or Google bundles and grant changes |
| consolidated_vendors | 6% | Move to a larger CRM or AMS |
| business_closed | 6% | Organization closes or merges |
| payment_failed | 5% | Involuntary |
| switched_competitor | 4% | |

Total: 100%. All shares [design]. Context: Microsoft retired its nonprofit Business Premium and E1 grant offers, with renewals allowed through the next renewal on or after July 1, 2025; coverage put the affected base near 400,000 nonprofits (https://wholewhale.com/resources/400k-nonprofits-impacted-by-microsoft-grant-cancellation-coming-july-2025/) [unverified, advocacy-press]. A Cybernews piece says the program was retired in June 2026, but I could not confirm this date (https://cybernews.com/tech/microsoft-data-non-profits/) [unverified].

### 3. Leading indicators
- Grant end date in the customer's record, or a grant-funded role marked as ending.
- Form 990 or public filings showing revenue decline.
- Staff departures on LinkedIn (executive director, development director, operations).
- Failed donation or subscription payments.
- Board meeting agendas with "cost reduction" or "deficit."
- Reduced logins by the account's admin.

### 4. Timing
- Churn clusters at grant end dates, often mid-year, and at fiscal year end (many nonprofits use July 1 or calendar years).
- The 2025 Minnesota Council of Nonprofits Pulse Check found organizations under strain cut staff and programs before closing; none said they were very likely to close within 12 months (https://minnesotanonprofits.org/wp-content/uploads/2026/01/2025-Pulse-Check-Report.pdf). Implication: stress shows up as downgrades first, cancellations later.
- Vendor notice: [design] short, often under 30 days.

### 5. Save tactics
- **Pause plan** for up to 3 months with data retained. [design] Often saves 20-35% of accounts facing a grant gap.
- **Downgrade to a basic tier** or fewer seats. [design] The most common save path.
- **Nonprofit discount** with verification. Effective when the vendor already has one.
- **Annual prepay discount** locks revenue for a year. [design] Reduces logo churn in the year but leaves a renewal cliff.
- **Data portability and export** lowers the fear of lock-in, which helps retain users who would otherwise leave for a free tool.

### 6. What a solo founder can realistically do
- Ask each customer for their grant end date at onboarding and put it in the CRM.
- Offer a pause plan and a basic tier before the grant ends.
- Target associations with dues cycles and multi-year membership contracts. They churn less.
- Avoid dependence on Microsoft or Google nonprofit grant programs for pricing comparisons. Those programs change.

### 7. Sources
- Urban Institute / Chronicle of Philanthropy, government funding loss, 2025: https://www.philanthropy.com/article/a-third-of-u-s-nonprofits-that-serve-communities-lost-government-funding-in-early-2025
- Minnesota Council of Nonprofits, 2025 Pulse Check: https://minnesotanonprofits.org/wp-content/uploads/2026/01/2025-Pulse-Check-Report.pdf
- Connecticut Nonprofit Alliance, Survey of Federal Impact (Oct 2025): https://ctnonprofitalliance.org/wp-content/uploads/2025/10/Survey-of-Federal-Impact.pdf
- Greater Lowell Community Foundation survey (Sept 2025): https://insidelowell.com/survey-reveals-impact-of-funding-cuts-on-gr-lowell-nonprofits/
- WholeWhale, Microsoft nonprofit grant change (2025): https://wholewhale.com/resources/400k-nonprofits-impacted-by-microsoft-grant-cancellation-coming-july-2025/
- Neon One Recurring Donor Report (Apr 2026, donor behavior not software churn): https://neonone.com/?p=60020

---

## Segment 4: Churches and religious organizations

### 1. Churn level
- **Annual logo churn:** [design] 12-20% for church management and giving software. Small churches (under 100 attendance) churn most.
- **Annual revenue churn:** [design] 8-14%. Larger congregations and multi-site churches are stickier.
- **Involuntary churn:** [design] 2-5%. Giving platforms with card or ACH recurring gifts see more failures than church admin software.
- **Closure base rate:** Lifeway found 1.8% of active Southern Baptist congregations (49,842 in 2022) disbanded or closed by 2023; sustained at that rate, about 18% close over a decade (https://news.lifeway.com/2025/04/15/few-protestant-pastors-believe-their-churches-will-close-soon/). Duke's Mark Chaves cites about 1 in 100 churches closing per year historically (same source). Pastors are optimistic: 94% expect their church to be open in 10 years.

### 2. Reason mix (estimated shares)
| Reason id | Share | Note |
|---|---|---|
| champion_left | 22% | Pastor or administrator departure; new leader switches tools |
| switched_competitor | 15% | Planning Center, Pushpay, Breeze, Tithe.ly, CCB |
| business_closed | 12% | Congregation closes or merges |
| price_too_high | 10% | Megachurch packages sold to small churches |
| not_using / low_adoption | 10% | Most features unused |
| missing_feature | 8% | No giving portal or church app |
| poor_support | 7% | |
| outgrew_product | 6% | Small church outgrows free tier or grows past seat cap |
| payment_failed | 4% | Involuntary |
| acquired_or_merged | 3% | |
| platform_built_in | 3% | |

Total: 100%. All shares [design]. Anecdotal support from Capterra reviews: a Planning Center Giving reviewer said they moved from Pushpay to a cheaper, easier tool after being locked into a contract; another left CCB and Pushpay because the older platform did not keep pace (https://www.capterra.com/p/76708/Planning-Center/reviews/). These are individual reviews [unverified].

### 3. Leading indicators
- Pastor resignation or announced sabbatical; new pastor or administrator hire.
- Attendance decline in church reports (where the church publishes them).
- Staff reduction (fewer people using the tool; seats falling).
- Late giving-platform payments or failed gift cards.
- Church posts about merger, multi-site consolidation, or building sale.
- Admin logins down for two or more months.
- Church Center or giving-app support tickets rising.

### 4. Timing
- Budget year is usually the calendar year. Budget season (Oct-Dec) is when tool costs get cut.
- Pastoral transitions cluster in summer, which also triggers tool changes.
- Congregation closures can be sudden. Pastor resignations usually give 1-3 months' notice [design].
- Vendor notice: [design] often none for a closure; 1-3 months for a leadership change.

### 5. Save tactics
- **Handoff to the new leader** within 30 days of a leadership change. [design] Often the difference between keeping and losing the account.
- **Annual prepay discount**, when the church budget is set. [design] Locks the year.
- **Downgrade to a smaller seat tier** or a giving-only plan. [design] Common save for small churches.
- **Training session for volunteers** raises adoption, lowering not-using churn. [design]
- **Bundling giving and church app.** Creates switching cost, as reviews suggest churches want one system [unverified].

### 6. What a solo founder can realistically do
- Pick one denomination or network and build referral relationships with its leaders. Referrals from a trusted network churn less.
- Build the leadership-change handoff into onboarding: a second admin contact and a training plan.
- Offer a small-church plan with a low price and no lock-in, to avoid being displaced by a megachurch package.
- Tie giving revenue to a payment fee model only if it is clear to the church; many small churches push back on fees.

### 7. Sources
- Lifeway Research, pastors and church closures (Apr 2025): https://news.lifeway.com/2025/04/15/few-protestant-pastors-believe-their-churches-will-close-soon/
- Religion News Service, pastor optimism vs closures (Apr 2025): https://religionnews.com/2025/04/16/most-pastors-think-their-churches-wont-close-anytime-soon-they-are-right-for-now/
- Ministry Watch, pastors on church survival: https://ministrywatch.com/most-pastors-say-their-churches-will-survive-and-for-now-theyre-right/
- Capterra, Planning Center reviews: https://capterra.com/p/76708/Planning-Center/reviews/
- Capterra, Breeze (Tithe.ly) reviews: https://capterra.com/p/132513/Breeze-ChMS/reviews/
- Pushpay blog, best church management software 2026 (vendor source, promotional): https://pushpay.com/blog/best-church-management-software-for-2026/
- ChurchApps blog, signs your church has outgrown its software (vendor source): https://pages.churchapps.org/blog-5-signs-your-church-has-outgrown-its-current-software
