# C4: Professional-services segments: why SaaS churns

Method note: web search returned little segment-specific churn data for 2023-2026. Most figures below come from vendor blogs, secondary aggregators, or trade press, and are marked [unverified]. Reason-mix tables and most churn-level numbers are my estimates and are marked [design]. Search date: 2026-10-14.

Cross-cutting benchmark used for all segments: Churnkey's State of Retention 2025 (data year 2024) reports voluntary cancellations of about 7%/month and involuntary of about 1%/month on average across its dataset, and says involuntary churn "can easily comprise 40% of your churn, if not more." The two statements do not match each other exactly, and the dataset is not segmented. Source: https://churnkey.co/reports/state-of-retention-2025 (last_updated 2026-09-11 per page metadata).

---

## 1. Law firms

**Churn level.** No law-firm-specific logo or revenue churn figure turned up. Clio reports more than US$500M ARR and does not disclose churn in its press release (https://www.clio.com/?p=56400, date not shown in result). Third-party Clio retention numbers (about 96% SMB retention) are from low-quality sites and are [unverified]. [design] Annual logo churn for small-firm practice-management SaaS: 12-20%. Revenue churn: 8-12%. Monthly-billed plans churn 2-3x faster than annual. Involuntary share: [design] 10-15%, based on the Churnkey split above.

**Reason mix [design]:**

| Reason id | Share |
|---|---|
| switched_competitor | 18% |
| price_too_high | 14% |
| not_using / low_adoption | 12% |
| champion_left (office manager or billing admin who owned the tool) | 10% |
| missing_feature (trust accounting, e-filing, calendar sync) | 8% |
| acquired_or_merged (firm merger onto another platform) | 8% |
| poor_support | 6% |
| onboarding_failed | 6% |
| owner_retired_or_sold (solo or small-firm retirement) | 6% |
| business_closed | 5% |
| payment_failed | 4% |
| bugs_reliability | 3% |

Anecdotal support: Capterra reviews show switching between Clio, MyCase, PracticePanther and Lawmatics. One reviewer moved away mainly because cancellation required a support request and call, with no online option (https://www.capterra.com/p/140231/PracticePanther-Legal-Software/reviews/?page=10, date not shown). Cancellation friction distorts the stated-reason data, so treat the mix as a floor on "switched" and "price" reasons. The 2020 Dewey B Strategic survey (n=87) cited "high cost / low usage" and non-competitive pricing (https://www.deweybstrategic.com/?p=7889, 2020, [unverified]).

**Leading indicators.** Seat count falls (an associate or paralegal leaves). Logins drop for the billing user. An attorney goes part-time, moves to in-house, or retires. Invoices fail. The office manager, who usually owns the tool, gives notice. The firm starts an RFP or a bar-association technology review.

**Timing.** Churn clusters at annual renewal and at calendar year-end, when firms plan budgets. Notice is usually none for annual plans and about 30 days for monthly plans. The first 90 days matter most, because data migration from the prior system is the main onboarding failure.

**Save tactics.** [design] Annual-prepay discount, seat downgrade instead of cancellation, data-migration help before the renewal date, and integrations that create switching cost (trust accounting, e-filing, Outlook and Google calendar sync). Published save rates for this segment were not found.

**What a solo founder can do.** Pick one practice niche (for example immigration, family, or personal injury) where the workflow is specific and the switching cost is real. Build the integration the niche needs. Make data export and cancellation self-serve, since a hard exit becomes a bad review. Track seat counts weekly. Run a short exit survey on every cancellation. The 2025 ABA survey reports 73% of firms use cloud legal tools (https://www.americanbar.org/news/abanews/aba-news-archives/2025/03/aba-releases-survey-tech-trends/, March 2025), so the market is mature and the fight is for switching.

**Sources**
- https://www.americanbar.org/news/abanews/aba-news-archives/2025/03/aba-releases-survey-tech-trends/ (March 2025)
- https://www.clio.com/?p=56400 (Clio ARR press release, 2025-2026)
- https://www.capterra.com/p/140231/PracticePanther-Legal-Software/reviews/?page=10 (undated)
- https://www.deweybstrategic.com/?p=7889 (2020)
- https://churnkey.co/reports/state-of-retention-2025 (data 2024, page updated 2026-09-11)

---

## 2. Accounting and CPA firms

**Churn level.** No measured churn for accounting practice-management or tax SaaS was found. TaxDome cites 98% client retention on a third-party comparison page, with no methodology [unverified]. [design] Annual logo churn for firm-level tax and practice software: 8-15%. Monthly-billed client-portal tools: 25-35% annual. Involuntary share: [design] 8-12%.

**Reason mix [design]:**

| Reason id | Share |
|---|---|
| not_using / low_adoption (tool used only in season, then dropped) | 14% |
| price_too_high | 14% |
| switched_competitor | 14% |
| poor_support (support unavailable in Feb-Apr) | 10% |
| consolidated_vendors (bundled into Intuit, Thomson Reuters or CCH suite) | 8% |
| business_closed (firm retirement or sale) | 8% |
| bugs_reliability (broken after season updates) | 7% |
| outgrew_product | 6% |
| champion_left (managing partner or practice admin) | 6% |
| acquired_or_merged (firm rolled up into a PE platform) | 6% |
| security_or_compliance | 4% |
| payment_failed | 3% |

Supporting context: a 2026 CPA Practice Advisor piece says firms patch post-season breakage, and a sponsored item cites crashes and remote-access failures at small firms (https://www.cpapracticeadvisor.com/2026/02/24/what-cpa-firms-miss-when-preparing-for-tax-season/178747/, 2026-02-24). A TaxDome-sponsored article claims 90% of clients who switch accountants do so because they cannot get answers (vendor, [unverified], origin not traced). The AICPA 2025 National MAP Survey was released November 2025 and is the place to look for firm-level retention data (https://www.aicpa-cima.com/resources/article/key-small-firm-insights-in-the-2025-national-map-survey, 2025-11, figures not retrieved).

**Post-tax-season churn.** [design] Most cancellations are decided in two windows. The first is May-June, when the firm reviews its season and the tool's value is fresh but seat use has dropped. The second is September-December, when firms budget for next season and renew or switch. Preparers often leave after April, which removes the seat owner. Expect the largest drop in seat count and logins in May-August.

**Leading indicators.** Logins fall sharply between May and August. Seat count drops after April. The preparer or staff member who owns the tool leaves. Support tickets go unanswered in February. A firm sends a "reviewing our software" message to peers. An RFP or a competitor's "switch offer" appears in the firm's inbox.

**Timing.** Churn spikes at renewal in Q3-Q4 (budget season) and after April 15. Notice is usually short, since many firms cancel by email at renewal.

**Save tactics.** [design] Off-season pause or reduced "dormant" plan at roughly 30-50% of list price, annual prepay with a locked season-ready migration, data-import help before January, and a shared client portal that clients use every year. Published save rates were not found.

**What a solo founder can do.** Sell to a specific firm type (for example, small S-corp or bookkeeping-heavy firms) and avoid the Intuit bundle. Offer a seasonal plan: off-season pricing with a fixed reactivation date. Freeze releases from mid-January to mid-April. Email the owner before the September renewal. Monitor logins in June and July as the early warning. Reach the firm's preparers, not just the owner, so the tool survives staff turnover.

**Sources**
- https://www.cpapracticeadvisor.com/2026/02/24/what-cpa-firms-miss-when-preparing-for-tax-season/178747/ (2026-02-24)
- https://www.aicpa-cima.com/resources/article/key-small-firm-insights-in-the-2025-national-map-survey (2025-11)
- https://www.thetaxadviser.com/news/2024/aug/2024-tax-software-survey.html (2024-08)
- https://www.cpapracticeadvisor.com/2025/12/18/taxdome-releases-2025-annual-report-marking-its-second-year-of-voluntary-transparency/175138/ (2025-12-18, vendor report, figures not retrieved)
- https://churnkey.co/reports/state-of-retention-2025 (2026-09-11 page update)

---

## 3. Real estate brokerages and agents

**Churn level.** Agent turnover is the main driver, and it is measured in several ways that do not match:
- Recruiting Insight with Lone Wolf and MyBFFSocial: 6.8% of productive agents changed in 2025, up from 6.0%. External moves were 5.5% (https://www.housingwire.com/articles/agent-migration-2025-trends/, 2026).
- Courted 2025 report: about 16% of agents (roughly 230,000) changed brokerages in 2025, stable at 16-18% since 2020 (https://www.housingwire.com/articles/agent-churn-2025-courted/, 2026).
- NAR membership fell 1.7% in the year to June 2026, per the NAR figure cited in a 2026 trade article (https://www.inman.com/2026/03/30/agent-commissions-show-stickiness-nearly-2-years-after-nar-settlement/, 2026-03-30, [unverified] secondhand).
- Cotality and ResiClub survey (213 agents, Feb-Mar 2026): 92% plan to stay active for at least three more years (https://www.resiclubanalytics.com/p/resale-turnover-4-decade-low-real-estate-agents-survey-cotality-resiclub, 2026).

Brokerage closures: iPro Realty (Ontario, about 2,400 agents) was ordered closed by the regulator RECO effective 2025-08-19 after a trust-account shortfall, which is a compliance failure, not a market downturn (https://reco.on.ca/news/update-for-consumers-and-agents-ipro-closure, 2025-08-19). I did not find a US-wide 2025 closure count.

[design] For SaaS sold per agent: monthly-seat churn 5-8%, annual logo churn 40-60%. For SaaS sold per brokerage: annual logo churn 15-25%. Involuntary share: [design] 5-10%, higher for individual-agent card billing.

**Reason mix [design]:**

| Reason id | Share |
|---|---|
| agent_exit_industry (business_closed / owner_retired_or_sold) | 16% |
| champion_left (team leader or broker leaves, takes the book) | 14% |
| budget_cut (fewer deals, market slowdown) | 12% |
| not_using / low_adoption | 12% |
| platform_built_in (brokerage provides a bundled CRM or IDX) | 10% |
| switched_competitor | 10% |
| price_too_high | 8% |
| missing_feature (MLS, IDX, transaction-tool integration) | 6% |
| payment_failed | 5% |
| acquired_or_merged (brokerage consolidation) | 4% |
| poor_support | 3% |

The key mechanism: brokerage-paid tools churn when the agent changes brokerage, and that happens about 16% a year. Seat tools churn when the agent exits the industry. A market slowdown mostly shows up as budget_cut in agent-paid tools.

**Leading indicators.** Transaction or listing counts fall for two or more quarters. A license renewal is near or lapsed. Logins drop after a team leader or broker leaves. Agent posts on Reddit or Facebook about leaving real estate or switching brokerages. A brokerage announces a new bundled tool. Payment method changes or cards fail.

**Timing.** Brokerage contracts commonly start and end in January. Agent exits cluster around license renewal dates and the slow winter months. Notice is usually none, because agents stop paying and disappear.

**Save tactics.** [design] Pause during slow months, a lower-priced "inactive" tier, moving a team to a brokerage-level contract, and tying the tool to MLS or transaction workflows. Published save rates were not found. The Cotality survey suggests most exits have already happened, so save effort is better spent on the agents who remain.

**What a solo founder can do.** Sell to team leaders or brokerages, not individual agents, because brokerage-level contracts survive agent moves better. Make the product survive a team leader leaving (contacts and pipeline export, team transfer). Watch transaction volume as the leading indicator. Track the agent's brokerage in the account record so a move becomes an event, not a silent loss.

**Sources**
- https://www.housingwire.com/articles/agent-migration-2025-trends/ (2026)
- https://www.housingwire.com/articles/agent-churn-2025-courted/ (2026)
- https://www.resiclubanalytics.com/p/resale-turnover-4-decade-low-real-estate-agents-survey-cotality-resiclub (2026)
- https://reco.on.ca/news/update-for-consumers-and-agents-ipro-closure (2025-08-19)
- https://www.inman.com/2026/03/30/agent-commissions-show-stickiness-nearly-2-years-after-nar-settlement/ (2026-03-30)

---

## 4. Marketing and creative agencies

**Churn level.** Agency-as-customer and client-loss-driven churn are different things. Here the SaaS customer is the agency, and its churn follows its own client losses.
- Focus Digital benchmarks, cited secondhand, put annual client churn at about 33% (performance), 28% (hybrid) and 18% (retainer) for 2025. Other pages attribute similar figures to a 2026 report, so the year is unclear (https://focus-digital.co/average-churn-rate-by-industry-saas/ and https://focus-digital.co/?p=6135, [unverified]).
- Setup 6th Annual Marketing Relationship Survey (2025, 400+ respondents): clients say they leave because of what the agency did or did not do. Agencies believe clients leave because of what happened to the client (https://everything-pr.com/the-cmo-agency-trust-gap-2026-why-clients-leave-and-why-agencies-dont-see-it-coming, 2026, secondary summary, [unverified]).
- Vendasta 2023 (cited by Duda): most agencies see 2-8% churn, period not stated (https://blog.duda.co/warning-signs-your-smb-client-might-churn-and-how-to-keep-them, [unverified]).

Budget context: Gartner's 2025 CMO Spend Survey (February-March 2025, n=402) found budgets flat at 7.7% of revenue. 39% of CMOs plan to cut agency budgets, and the top lever is eliminating underperforming agency relationships (https://www.businesswire.com/news/home/20250512782208/en, 2025-05-12). 22% of CMOs say generative AI has reduced their need for outside creative support (same source). A newsletter's 1H 2025 tracker found 11 of 47 agency categories grew, with creative and content shops among the weakest. This is self-reported and directional (https://vangal.beehiiv.com/p/flat-is-the-new-growth-what-q2-2025-really-looked-like-for-agencies, 2025).

[design] Annual logo churn for agencies using SaaS: 20-35%, higher for project-billed agencies. Involuntary share: [design] 3-8%, since agencies usually pay by card or invoice.

**Reason mix [design]:**

| Reason id | Share |
|---|---|
| budget_cut (client cut spend, agency lost client) | 20% |
| champion_left (account lead or ops manager leaves) | 12% |
| switched_competitor | 12% |
| not_using / low_adoption (seats idle after layoffs) | 14% |
| business_closed or acquired (agency shut or sold) | 8% (business_closed 5%, acquired_or_merged 3%) |
| price_too_high | 8% |
| missing_feature (reporting, client portal, ad-platform integration) | 6% |
| consolidated_vendors (tool replaced by an all-in-one or AI tool) | 6% |
| outgrew_product | 4% |
| poor_support | 4% |
| payment_failed | 3% |

Note on the table: it sums to 100 but "acquired_or_merged" and "business_closed" are combined into one row to keep the count at 12 reasons.

**Leading indicators.** The agency's client count falls for two quarters. Layoffs or hiring freezes appear in the news. Seat counts drop after an account-lead departure. Invoices slip. The agency runs a formal pitch or review of its own accounts. Logins fall for the account leads, while reporting-only users keep logging in.

**Timing.** Client losses are decided at annual budget cycles (Q4 planning, Q1 reset) and after pitches. The agency's SaaS cancellation typically follows 1-2 quarters after the client loss shows up in its revenue. First 90 days matter for new agencies, which often sign with tools and then fail to adopt them.

**Save tactics.** [design] Retainer-style pricing with a per-client or per-seat flex, seat pausing during slow quarters, and integrations to the ad platforms and reporting stack that the agency reports from. Published save rates were not found.

**What a solo founder can do.** Sell to agencies that run retainers (agencies with retainer models churn less than project-based shops, per Focus Digital, [unverified]). Price so the agency can scale seats down without losing the product. Build the monthly client report, because it is the artifact the agency must send and it drives retention. Watch client count and seat count together. Survey agencies within 30 days of a client loss.

**Sources**
- https://www.businesswire.com/news/home/20250512782208/en (2025-05-12, Gartner)
- https://focus-digital.co/average-churn-rate-by-industry-saas/ (undated, [unverified])
- https://focus-digital.co/?p=6135 (undated, [unverified])
- https://www.vcita.com/press/smb-survey-highlights-marketing-agency-churn (2025-04, vcita SMB survey of 500)
- https://blog.duda.co/warning-signs-your-smb-client-might-churn-and-how-to-keep-them (undated, [unverified])
- https://vangal.beehiiv.com/p/flat-is-the-new-growth-what-q2-2025-really-looked-like-for-agencies (2025)
- https://www.decisionmarketing.co.uk/news/agencies-firmly-in-the-firing-line-as-cmos-plot-cutbacks (2025)
