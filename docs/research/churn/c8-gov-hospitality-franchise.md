# C8: Churn reasons for SaaS sold to government, hospitality and franchise buyers (research, late 2026)

Scope note: public churn data for these segments is very thin. No source found gives logo or revenue churn for SaaS sold to city, county, state, or federal buyers, nor for hotel groups or franchise systems. Vendor-level numbers exist only for large public companies (ServiceTitan, which sells to trades, not these segments). Most reason-mix shares below are [design] estimates built from procurement mechanics and the news events listed in each section. Secondary and vendor figures are marked [unverified].

Common mechanics across all five: a government or franchise buyer churns mostly at a contract or budget event, not at a card decline. Involuntary churn is a small share in these segments because invoices go to institutional AP, not to cards.

---

## 1. City and county government

**1. Churn level**
- Annual logo churn: [design] 6–12% for software on multi-year municipal contracts; annual revenue churn [design] 4–9%. Most churn is contract-end, not mid-term cancellation.
- Monthly vs annual: most municipal buyers pay annually or on a 3–5 year term with annual appropriation. Monthly plans are rare. A [design] 3–5x gap in churn between monthly and annual plans is a general SaaS pattern [unverified: https://stealthagents.com/research/saas-churn-rate-statistics-2026, 2026].
- Involuntary churn (failed payments): [design] under 2%. Purchase orders and warrants fail for budget reasons, which show up as non-renewal, not as card failures.

**2. Reason mix (share of churned contracts, [design])**

| Reason id | Share |
|---|---|
| contract_term_end_rfp (forced rebid at term end) | 30% |
| budget_cut (general fund or enterprise fund shortfall) | 18% |
| champion_left (department head or IT director retires or moves) | 14% |
| consolidated_vendors (county or regional shared service) | 10% |
| missing_feature / moved_to_in_house | 8% |
| switched_competitor (rebid winner) | 7% |
| poor_support / bugs_reliability | 5% |
| security_or_compliance (state audit, CJIS, PCI) | 4% |
| not_using / low_adoption | 3% |
| Other (new administration reverses a purchase) | 1% |

Sum: ~100%.

**3. Leading indicators**
- Contract within 12 months of expiry with no renewal conversation logged.
- Procurement posting a Request for Information or Request for Proposal in the same category.
- Budget season (typically the spring for fiscal years starting July 1 or October 1) with a department line flagged for review.
- New council or mayor, or a new IT director, in a contract's first year.
- Usage down: fewer logins by staff; a department that stops reporting through the tool.
- Public-meeting agenda items about a related vendor.

**4. Timing**
- Churn clusters at contract end. Many city contracts run on fiscal years that end June 30 or September 30, so non-renewal notices often arrive 60–120 days before that date [design].
- Mid-term churn is rare: most municipal contracts have no termination-for-convenience clause in the first term [design].
- Vendor notice: [design] 60–120 days, usually via a procurement notice rather than the buyer contacting the vendor.
- Election-driven churn: a new administration can cancel a discretionary purchase, but the San Francisco OpenGov case (2026) shows a mayoral directive producing a $5.9M award with no competitive bid, which is the reverse pattern [unverified: https://sfstandard.com/2026/09/02/san-francisco-opengov-daniel-lurie-contract-software/]. Staff-led replacement also happens: Naperville, IL moved e-procurement from DemandStar to OpenGov on Jan 5, 2026, a staff decision [unverified: https://www.naperville.il.us/globalassets/media/meeting-agendas-and-minutes/managers-memorandum/mm20251218.pdf, dated 2025-12-18].

**5. Save tactics and save rates**
- Multi-year rate contract or cooperative contract (state or NASPO-style) listing: [design] raises renewal odds sharply because the vendor is pre-qualified and the buyer avoids a rebid.
- Pre-rebid engagement 9–12 months before expiry: [design] save rate 40–60%.
- Integration with payroll, permitting, or utility billing systems: switching cost is the main reason a council keeps a tool. [design]
- Executive sponsor (city manager, CFO) outreach: [design] useful, but rarely wins against a mandated rebid.

**6. What a solo founder can realistically do**
- Track contract end dates in a spreadsheet for every municipal customer; start renewal talks 9–12 months out.
- Get listed on a state or cooperative contract vehicle. This is the single most useful move for avoiding rebids, but the listing takes months and often costs money.
- Build a renewal packet with usage and outcome data that a procurement officer can read in five minutes.
- Do not depend on one department champion; get a second contact in finance.

**7. Sources**
- https://sfstandard.com/2026/09/02/san-francisco-opengov-daniel-lurie-contract-software/ (2026-09-02)
- https://www.naperville.il.us/globalassets/media/meeting-agendas-and-minutes/managers-memorandum/mm20251218.pdf (2025-12-18)
- https://stealthagents.com/research/saas-churn-rate-statistics-2026 (2026) [unverified]

---

## 2. State government

**1. Churn level**
- Annual logo churn: [design] 5–10%. State agencies buy through statewide contracts and renew more reliably than cities, but a budget freeze can end a whole category at once.
- Annual revenue churn: [design] 3–8%.
- Involuntary churn: [design] under 1%. Payments go through state payment systems.

**2. Reason mix ([design])**

| Reason id | Share |
|---|---|
| budget_cut / budget freeze | 28% |
| contract_term_end_rfp (statewide contract rebid) | 22% |
| consolidated_vendors (enterprise licensing, state CIO consolidation) | 12% |
| champion_left (agency director or CIO change) | 10% |
| funding_ended (federal pass-through grant ends) | 8% |
| missing_feature / moved_to_in_house | 6% |
| security_or_compliance (state audit, StateRAMP) | 5% |
| switched_competitor | 4% |
| poor_support / bugs_reliability | 3% |
| regulation_change (new state law) | 2% |

Sum: 100%.

**3. Leading indicators**
- State revenue reports showing collections below forecast. Revenue shortfalls lead to freezes within a quarter or two.
- A governor's order freezing IT or service-contract purchasing: California's 2023 Department of Finance order required agencies to review IT maintenance and operations contracts, including software licenses, and terminate those no longer needed [unverified: https://meritalkslg.com/articles/california-drops-bombshell-with-state-it-spending-freeze/]. Washington's 2024 order froze most non-essential service contracts and purchasing [unverified: https://washingtonstatestandard.com/2024/12/03/wa-gov-inslee-orders-hiring-and-travel-freeze-for-state-agencies/, 2024-12-03].
- A July 2026 Nebraska announcement of added cuts and a hiring freeze after a $172M projected deficit [unverified: https://www.kwit.org/podcast/spm-news/2026-07-09/nebraska-governor-pillen-announces-plan-to-address-states-budget-shortfall, 2026-07-09]. Software contracts were not mentioned.
- A new state tax on information technology and data services in Nebraska's FY2026 budget, which may raise the cost of a software line item [unverified, same source].
- A federal grant ending (for example, pandemic-era K-12 funds). ESSER extensions were rescinded in March 2025 and later partly restored, with a final late-liquidation deadline of March 28, 2026 [unverified: https://thejournal.com/articles/2025/03/31/ed-abruptly-cancels-esser-funding-extensions.aspx, 2025-03-31]. Districts that bought edtech on ESSER faced cuts [unverified, same source; K-12 districts are a separate segment].

**4. Timing**
- Most state fiscal years start July 1. Budget decisions and freezes cluster in the spring (budget submission) and in the fall (mid-year revisions) [design].
- Statewide contracts renew on the contract's own cycle, often 3–5 years with options. Non-renewal is announced months ahead through a re-solicitation.
- Freezes can take effect with two to four weeks' notice and can hit mid-term subscriptions that were not renewed or were reduced [design].

**5. Save tactics and save rates**
- Seat or tier downgrade instead of cancellation: [design] the most common save; works in a freeze because it reduces spend without a formal termination.
- Making the product count as a freeze exemption (revenue collection, tax, public safety, federal compliance): the Washington order exempted revenue-generating contracts [unverified, 2024]. Save rate [design] high if the product qualifies.
- Shifting the license to a statewide vehicle: [design] keeps the vendor on the state's list.
- Executive sponsor outreach to the agency CIO before the budget submission: [design] 30–50% save in a soft freeze.

**6. What a solo founder can realistically do**
- Check whether the product maps to an exemption category (revenue, public safety, federal compliance) and say so in writing.
- Pursue a statewide contract or a reseller listing, since individual agency deals are the most freeze-exposed.
- Offer annual prepayment at a discount only when the agency has budget authority left in the fiscal year.
- Track state revenue forecasts and freeze notices; a freeze is a signal to call the agency before the next billing date.

**7. Sources**
- https://meritalkslg.com/articles/california-drops-bombshell-with-state-it-spending-freeze/ (2023)
- https://washingtonstatestandard.com/2024/12/03/wa-gov-inslee-orders-hiring-and-travel-freeze-for-state-agencies/ (2024-12-03)
- https://www.kwit.org/podcast/spm-news/2026-07-09/nebraska-governor-pillen-announces-plan-to-address-states-budget-shortfall (2026-07-09)
- https://thejournal.com/articles/2025/03/31/ed-abruptly-cancels-esser-funding-extensions.aspx (2025-03-31)

---

## 3. Federal government

**1. Churn level**
- Annual logo churn: [design] 8–15% for a small vendor. Federal recompetes are frequent (often 3–5 years, sometimes one year) and the incumbent can lose.
- Annual revenue churn: [design] 6–12%.
- Involuntary churn: [design] near zero. Federal payment is by invoice; delays show up as slow payment, not cancellation.

**2. Reason mix ([design])**

| Reason id | Share |
|---|---|
| contract_term_end_rfp (recompete lost to a larger or lower-priced bidder) | 25% |
| budget_cut / de-obligated funds (2025–2026 spending cuts) | 20% |
| consolidated_vendors (GSA OneGov or agency enterprise deals) | 14% |
| funding_ended (continuing resolution, shutdown, funds not released) | 10% |
| champion_left (program office turnover, reorganization) | 8% |
| security_or_compliance (FedRAMP, ATO lapse) | 7% |
| switched_competitor | 5% |
| Contract cancelled by political action (DOGE-era termination) | 5% |
| missing_feature / poor_support | 4% |
| not_using / low_adoption | 2% |

Sum: 100%. The shares for the last two rows are weighted up for 2025–2026 [design].

**3. Leading indicators**
- Recompete notice or a sources-sought notice on SAM.gov 6–18 months before expiry.
- Continuing resolution in place (funding at prior-year levels, no new starts) or a shutdown; during the October 2025 shutdown, the 20 largest civilian agencies spent 63% less in October 2025 than in October 2024 [unverified: https://washingtontechnology.com/contracts/2025/11/civilian-agency-spending-cratered-during-shutdown/409795/, 2025-11]. Vendors responded with austerity measures [unverified: https://federalnewsnetwork.com/government-shutdown/2025/10/vendors-starting-to-take-shutdown-related-austerity-measures/, 2025-10].
- Agency IT review under OMB memo M-26-10 (March 31, 2026), which requires CIO review and approval of covered IT contracts and monthly logs of them to OMB [unverified: https://govciomedia.com/omb-memo-forces-agencies-to-rethink-procurement-oversight/]. Expect longer approval queues and possible non-renewal of duplicative tools.
- A DOGE-era cancellation list: DOGE cancelled about 1,100 federal contracts in early 2025, and reporting later found many of the cancellations saved nothing [unverified: https://fortune.com/2025/02/25/doge-canceled-1100-federal-contracts-no-save-government-money, 2025-02-25]. Some cancelled contracts were later revived, including software licences [unverified: https://www.yahoo.com/news/more-220-million-contracts-canceled-211240992.html, undated]. Revival is a sign the program still wants the tool.

**4. Timing**
- Churn lands at option-year or contract-end dates. Federal fiscal year ends September 30; a lot of spending is pushed into the last quarter (Q4), and a lapse in appropriations lands in October [design].
- Shutdown history: a 43-day shutdown ran from October 1 to November 12, 2025, followed by a CR to January 30, 2026 [unverified: https://en.wikipedia.org/wiki/2026_United_States_federal_budget]. A further short lapse in early 2026 was reported [unverified, same source; check congress.gov for exact dates].
- Vendor notice: [design] 30–90 days for option-year non-exercise; often none for a recompete loss beyond the award notice.

**5. Save tactics and save rates**
- Option-year exercise: the program office can usually renew if it has funds, so a pre-option call 90 days out is the main save point [design].
- GSA schedule or OneGov listing: [design] reduces the chance that an agency rebuys elsewhere, but OneGov pricing can cut margin. GSA said it would negotiate directly with IT vendors rather than resellers [unverified: https://washingtontechnology.com/opinion/2025/12/doge-was-government-contractings-biggest-story-2025-and-its-not-close/410372/, 2025-12].
- Integration into an agency system of record: switching cost; [design].
- Shifting from a discretionary program line to a mandated one (statute or regulation): [design] the most durable save but rarely in a vendor's control.

**6. What a solo founder can realistically do**
- Do not build a federal business on one agency. Recompetes are lost at a high rate and the buyer can change by reorganization.
- Get a GSA schedule or a reseller path only if the product fits a category agencies already buy; the paperwork takes many months.
- Track option-year dates and SAM.gov sources-sought notices in a spreadsheet.
- Keep an ATO or FedRAMP status page current; a lapse ends renewals [design].

**7. Sources**
- https://washingtontechnology.com/opinion/2025/12/doge-was-government-contractings-biggest-story-2025-and-its-not-close/410372/ (2025-12)
- https://fortune.com/2025/02/25/doge-canceled-1100-federal-contracts-no-save-government-money (2025-02-25)
- https://www.yahoo.com/news/more-220-million-contracts-canceled-211240992.html (undated)
- https://federalnewsnetwork.com/government-shutdown/2025/10/vendors-starting-to-take-shutdown-related-austerity-measures/ (2025-10)
- https://washingtontechnology.com/contracts/2025/11/civilian-agency-spending-cratered-during-shutdown/409795/ (2025-11)
- https://govciomedia.com/omb-memo-forces-agencies-to-rethink-procurement-oversight/ (2026)
- https://en.wikipedia.org/wiki/2026_United_States_federal_budget

---

## 4. Hotels and hospitality groups

**1. Churn level**
- Annual logo churn: [design] 15–25% for a single-hotel or small-group SaaS vendor (PMS add-ons, revenue tools, guest messaging). Owner or management company changes drive most of it.
- Annual revenue churn: [design] 10–18%.
- Involuntary churn: [design] 3–6%. Hotels pay by card or monthly ACH; failed cards are a real share for independent owners.

**2. Reason mix ([design])**

| Reason id | Share |
|---|---|
| acquired_or_merged (owner sold, new owner keeps its own stack) | 18% |
| platform_built_in / brand-mandated stack (flag change to a brand standard) | 16% |
| champion_left (general manager or director of sales leaves) | 14% |
| management company switch (third-party manager replaces the operator) | 12% |
| switched_competitor | 10% |
| not_using / low_adoption (staff stop using it) | 8% |
| missing_feature / integration gap | 7% |
| bugs_reliability / poor_support | 5% |
| budget_cut (owner cost reduction) | 5% |
| payment_failed (involuntary) | 5% |

Sum: 100%.

**3. Leading indicators**
- Management agreement termination or a disclosed sale: Service Properties Trust's 2025 sale of 113 managed Sonesta hotels to franchise partners was a large event [unverified: https://asianhospitality.com/sonesta-to-franchise-114-managed-properties-following-svc-sale, 2025].
- A brand conversion or flag change: a brand standard requires its own PMS, booking engine, or revenue tool (Braemar's April 2025 conversion of the Sofitel Chicago Magnificent Mile to a franchise agreement kept the hotel under its existing operator, [unverified: https://www.sec.gov/Archives/edgar/data/1574085/000157408525000029/bhr-20250403.htm, 2025-04-03]).
- Owner unilaterally ends a management agreement: Hilton Durban (February 2026) is one example [unverified: https://themercury.co.za/business/2026-02-10-hilton-hotel-in-durban-no-longer-part-of-hilton-portfolio, 2026-02-10].
- Tech-related signals: login drops, integration failures, staff turnover at the front desk or sales.
- Hotel PMS reliability and cybersecurity concerns: a 2025 survey reported that 48% of hotels would switch PMS vendors over reliability and 42% over cybersecurity [unverified: https://hoteltechreport.com/news/2026-hotel-pms-report, 2026].

**4. Timing**
- Churn follows the management agreement term (often 5–15 years, with a termination fee often calculated as a multiple of the prior 12 months' gross revenue [unverified: https://www.mishcon.com/news/hospitality-matters-hotel-agreements]) or a sale closing.
- Seasonality: vendors in hotels see the most churn after the summer peak and at the start of the fiscal year (January) [design].
- Vendor notice: [design] usually very short. The new owner or manager often gives 30 days or less, and the vendor learns from the new GM.

**5. Save tactics and save rates**
- Keep the account at the owner level, not the GM level: [design] 40–60% of acquisition-driven losses can be saved by showing the new owner a return figure before the sale closes.
- Integration with the brand's central systems (reservations, loyalty): [design] raises switching cost but also means the brand may mandate a replacement.
- Multi-property contract with a shared master agreement: [design] survives a single-property sale better.
- Pre-sale outreach to the buyer's asset manager: [design] useful, low volume.

**6. What a solo founder can realistically do**
- Sell to the owner or asset manager, and map the management company and brand flag for each property. An account is only as safe as the agreement that controls its tech stack.
- Set up a quarterly review of each property's management agreement expiry, sale news, and brand standard changes.
- Make data export and migration painless: a clean export helps the new operator keep you rather than rip you out.

**7. Sources**
- https://asianhospitality.com/sonesta-to-franchise-114-managed-properties-following-svc-sale (2025) [unverified]
- https://www.sec.gov/Archives/edgar/data/1574085/000157408525000029/bhr-20250403.htm (2025-04-03)
- https://themercury.co.za/business/2026-02-10-hilton-hotel-in-durban-no-longer-part-of-hilton-portfolio (2026-02-10)
- https://www.mishcon.com/news/hospitality-matters-hotel-agreements (undated) [unverified]
- https://hoteltechreport.com/news/2026-hotel-pms-report (2026) [unverified]

---

## 5. Franchise systems

**1. Churn level**
- Annual logo churn: [design] 10–20% for a SaaS sold to franchisees (the franchisee is the buyer), with the franchise system as a second buyer. Closures and transfers drive most of it.
- Annual revenue churn: [design] 8–15%.
- Involuntary churn: [design] 2–5%. Franchisees often pay through a franchisor-run billing account that adds a layer of failure.
- Closure base rate: a median annual franchised-outlet closure rate of 3.2% across 1,446 brands was reported in a 2026 aggregator analysis [unverified: https://www.webtonic.io/blog/franchise-lifecycle-and-retention-marketing-statistics, 2026]. Dickey's Barbecue Pit, for example, closed 97 franchised units and opened 12 in its fiscal 2024 [unverified: https://www.qsrmagazine.com/story/dickeys-barbecue-closes-85-u-s-franchised-restaurants/].

**2. Reason mix ([design])**

| Reason id | Share |
|---|---|
| business_closed (franchisee closes a unit) | 22% |
| franchisor_mandated_switch (brand mandates a different vendor) | 20% |
| owner_retired_or_sold (franchise transfer) | 12% |
| platform_built_in (brand provides a bundled system) | 10% |
| consolidated_vendors (brand enterprise deal) | 8% |
| budget_cut (franchisee cost pressure) | 7% |
| not_using / low_adoption (unit uses brand tool instead) | 6% |
| champion_left (franchisee ops manager leaves) | 5% |
| switched_competitor | 4% |
| payment_failed (involuntary) | 3% |
| missing_feature / poor_support | 3% |

Sum: 100%.

**3. Leading indicators**
- Franchisor announces a new technology standard or a mandated vendor. Franchise agreements commonly require franchisees to adopt prescribed technology at their own cost, and mandates are generally workable if disclosed in the FDD and written into the agreement [unverified: https://cfa.ca/start-me-up-considerations-for-franchisors-when-mandating-the-use-of-software-by-franchisees/; https://www.heritagelawwi.com/force-franchisee-to-buy-specific-pos-system].
- FDD Item 20 showing rising closures or terminations for the brand (closure counts are in Item 20 under the FTC Franchise Rule [unverified: https://afranchisecoach.com/glossaries/item-20/]).
- Unit-level signals: a franchisee that stops logging into a tool, misses royalty reports, or lets a lease lapse.
- Franchisee legal or financial stress: bankruptcies at the franchisee level (Subway has seen several [unverified: https://finance.yahoo.com/markets/stocks/articles/subway-closed-least-729-stores-105300180.html]).
- Brand-level sale or private-equity change, which often brings a consolidated vendor list.

**4. Timing**
- Mandated switches arrive with a deadline set by the franchisor, often 6–18 months from notice, and the upgrade is at the franchisee's expense [unverified: https://www.heritagelawwi.com/force-franchisee-to-buy-specific-pos-system].
- Closures happen at lease end or after a bad year; franchisee exits often cluster around renewal of the franchise agreement (typically 10 years) [design].
- Notice: [design] a unit closes with one to four weeks' notice, usually with no formal cancellation request.

**5. Save tactics and save rates**
- Get on the franchisor's approved vendor list: [design] the single most effective move. Brands that mandate a vendor usually pick from an approved list.
- Franchisee-level pricing for a mandated tool: [design] keeps unit-level loyalty when the brand mandate is loose.
- Offer a discount tied to the franchisor's enterprise agreement; [design] save rate 30–50% on mandated switches where the vendor is already on the list.
- Deal with the closure risk early: a unit on a 60-day runway can be saved only by a pause plan or a downgrade [design].

**6. What a solo founder can realistically do**
- Get listed as an approved or recommended vendor by the franchisor before the brand mandates one. Most franchisors do not run a public RFP; they pick from people who called them first.
- Price the franchisee tier low enough that a unit can absorb it in a bad quarter, and let the franchisor sponsor the rest.
- Track FDD Item 20 each year for each brand you sell to. A brand with rising closures is a churn warning.
- Expect that a franchisor mandate is a binary event: you either make the list or you lose the category.

**7. Sources**
- https://cfa.ca/start-me-up-considerations-for-franchisors-when-mandating-the-use-of-software-by-franchisees/ (2025-03) [unverified]
- https://www.heritagelawwi.com/force-franchisee-to-buy-specific-pos-system (undated) [unverified]
- https://www.hughes.com/resources/insights/networks/technology-problem-franchising (2021-02-22)
- https://www.webtonic.io/blog/franchise-lifecycle-and-retention-marketing-statistics (2026) [unverified]
- https://www.qsrmagazine.com/story/dickeys-barbecue-closes-85-u-s-franchised-restaurants/ (2025) [unverified]
- https://finance.yahoo.com/markets/stocks/articles/subway-closed-least-729-stores-105300180.html (2026) [unverified]
- https://www.vendasta.com/blog/?p=114251 (2025) [unverified; vendor claim that 40%+ of franchise brands run on spreadsheets]

---

## Gaps and caveats
- No public source gave churn rates for SaaS sold into any of these five segments. All churn figures are [design].
- Searches for ServiceTitan, Procore and Toast retention returned only ServiceTitan (gross dollar retention above 95% and net dollar retention above 110% for fiscal 2025, [unverified; https://investors.servicetitan.com/news-releases/news-release-details/servicetitan-announces-fiscal-fourth-quarter-and-full-year]). That is a trades vendor, not these segments.
- Involuntary-churn share ranged from roughly a quarter to two-fifths across secondary blogs; the figures conflict and were not used beyond the [design] estimates above (https://www.flycode.com/blog/churn-benchmarks-for-saas-businesses [unverified]).
- Business survival (BLS, establishment-level): about 49–51% of new employer establishments reach year five, and about 35% reach year ten for the 2013 cohort [unverified: https://www.bls.gov/opub/ted/2024/34-7-percent-of-business-establishments-born-in-2013-were-still-operating-in-2023.htm, 2024]. BLS counts an exit when an establishment stops reporting, including sales, mergers and retirements, not only failures.
