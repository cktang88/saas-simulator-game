# C6: Churn in regulated and asset-heavy segments (banks, insurance, manufacturing, utilities)

Research date: 2026-10-14. Conventions: [design] = my estimate, not sourced. [unverified] = secondary or vendor source, figure not traced to a primary dataset. Every other number carries its URL and date in the Sources list.

Data caveat for all four segments: no public source measures SaaS logo churn by these verticals directly. The reason mixes below are built from merger, vendor-consolidation and procurement evidence plus practitioner commentary, and should be read as design inputs, not measurements.

---

## 1. Banks, credit unions and financial services

### 1. Churn level
- Cross-industry B2B SaaS: Recurly 2025 Churn Report, as cited by Vitally, gives 3.5% average churn, of which 2.6% voluntary and 0.8% involuntary [unverified; Vitally page dated 2025-04-23, figure from Recurly 2025].
- Vendor SaaS sold to financial institutions (FIs) usually runs on annual or 3-5 year contracts, so monthly churn is not the right unit. Annual logo churn for a vendor serving community FIs: [design] 6-10%. Revenue churn: [design] 4-7%, because the largest accounts are the stickiest.
- Involuntary churn (failed payments): [design] 2-5% of churned logos. FIs pay through AP and invoices, so card failures are rare. The Recurly 23% involuntary share is for consumer-style billing and overstates this segment.
- Credit unions: 157 mergers in 2025 with $45B merged assets, per Treichel's NCUA-based analysis [unverified; podcast transcript, date 2026]. The federally insured CU count fell from 4,455 to 4,287 during 2025 [unverified; Walnut Invest citing NCUA]. Community bank sellers completed 127 mergers in 2025, the most since 2021 [Kansas City Fed, Community Banking Bulletin, Jan 2026, figure from search summary; PDF did not parse].

### 2. Reason mix (estimated, sums to 100)
| Id | Share |
|---|---|
| acquired_or_merged | 22% |
| consolidated_vendors | 14% |
| contract_term_end_rfp | 12% |
| switched_competitor (incl. core-driven switch) | 10% |
| champion_left | 8% |
| budget_cut | 7% |
| missing_feature | 6% |
| poor_support | 6% |
| security_or_compliance | 4% |
| onboarding_failed | 4% |
| not_using / low_adoption | 4% |
| bugs_reliability | 3% |

All shares are [design]. Support is the stated main reason banks change cores (ABA survey), so poor_support may be underweighted for core-adjacent vendors [design].

### 3. Leading indicators
- Merger announced, then a CIO or COO from the acquirer appears in LinkedIn or the 8-K.
- Acquirer's core or digital platform named in the S-4 or investor deck, which often omits your product.
- Branch closures or seat counts falling by location.
- Core conversion announced: the vendor's conversion slots are booked, so the FI often drops ancillary tools.
- Champion job change, support escalations about data access, and a missed QBR.

### 4. Timing
- Churn clusters at the contract end date and at the merger close, which typically comes 6-12 months after announcement [design].
- Acquired-bank vendor exits are often ordered by the acquirer with little notice. Vendors get notice periods of about 90-180 days when the FI controls the decision [design].
- ABA 2024 Core Platforms Survey: 69% of bankers are likely to stay with their core at renewal and 19% are likely to switch. Satisfaction falls the longer a contract runs, to 41% within two years of renewal [ABA Banking Journal, 2025-07-02].
- Termination fees scale with remaining term, so exits cluster at term end [American Banker; Barclay Damon, 2024-08].

### 5. Save tactics
- Multi-year deal with integration into the core or the acquirer's stack. This creates switching cost, and fee-based termination makes exits expensive [American Banker].
- Executive sponsor outreach to the acquirer's integration lead before the deal closes. Save rate [design]: 20-35% of at-risk accounts if reached pre-close, under 10% after the acquirer decides.
- Price per user rather than per branch, so branch consolidation does not cut the contract.
- Legacy-exit funding such as Fuse's $5M fund (March 2026) shows that some vendors offer exit help, which makes switching easier for the buyer [ATM Marketplace; vendor-funded, unverified].

### 6. What a solo founder can realistically do
- Watch 8-K and S-4 filings for bank deals. Track which acquirers bought your customers, and reach their new CIO before the close.
- Build the integration with the most common core processors so the product is hard to remove.
- Put a change-of-control and assignment clause in every contract, plus data-export terms, so acquired customers cannot be dropped silently.
- Avoid large FI deals. Sales cycles and procurement are long, and a single merger can take out a large share of revenue [design].

### 7. Sources
- https://www.vitally.io/post/saas-churn-benchmarks (2025-04-23; Recurly 2025 via secondary)
- https://bankingjournal.aba.com/2025/07/aba-survey-most-banks-likely-to-stick-with-current-core-provider/ (2025-07-02)
- https://www.kansascityfed.org/documents/14360/Community_Banking_Bulletin_Highlight_-_Jan_2026_-_MA_U7KPMwX.pdf (Jan 2026)
- https://www.ankura.com/insights/banking-industry-outlook-us-banking-ma-surge-arrives-in-q3 (Q3 2025)
- https://withflyingcolors.transistor.fm/348 (2026; NCUA data)
- https://walnutinvest.com/stats/credit-union-statistics (2026)
- https://barclaydamon.com/news/credit-union-times-breaking-free-strategies-for-credit-unions-to-navigate-vendor-terminations (2024-08)
- https://www.americanbanker.com/news/tech-contracts-creating-tangle-of-troubles-in-m-amp-a-deals (undated)
- https://www.bankingdive.com/news/flagstar-bank-fiserv-finxact-cloud-native-core-tech-modernization/828477/ (2025-2026)
- https://www.cuinsight.com/the-core-conversion-crunch-why-financial-institutions-must-act-now-to-secure-their-future/ (2025)
- https://www.sec.gov/Archives/edgar/data/854560/000117184325000370/exh_991.htm (FY2025 8-K)
- https://www.atmmarketplace.com/news/fuse-intros-fund-for-credit-unions-to-exit-legacy-vendor-contracts (2026-03)

---

## 2. Insurance carriers and agencies

### 1. Churn level
- Agency SaaS (AMS, comparative raters, sales and CRM tools) sold to independent agencies: annual logo churn [design] 6-10%, revenue churn [design] 5-8%. Carriers buying enterprise software churn less, around [design] 2-5% a year, because contracts run multi-year.
- Involuntary churn: [design] 3-5% of churned logos. Agencies pay by card or ACH, and failures are more common among small agencies.
- Consolidation is shrinking the buyer pool. Sonant AI reports 695 announced insurance distribution deals in 2025, down 12%, with 95 unique buyers [unverified; secondary blog].
- Independent agency count fell from about 39,000 (2024) to about 37,000 (2026), per Big I's Agency Universe Study as reported in the 2026 ACT Tech Trends material [unverified; search summary].

### 2. Reason mix (estimated, sums to 100)
| Id | Share |
|---|---|
| acquired_or_merged (roll-up standardizes the AMS) | 30% |
| consolidated_vendors | 16% |
| owner_retired_or_sold | 12% |
| champion_left (producer departs) | 10% |
| switched_competitor | 9% |
| missing_feature | 6% |
| budget_cut | 5% |
| poor_support | 4% |
| outgrew_product | 3% |
| security_or_compliance | 3% |
| business_closed | 2% |

All shares are [design]. The roll-up model is the main driver. Equal Parts moves acquired agencies onto its in-house operating system [Axios Pro, 2026-02-10], and Applied Systems bought EZLynx, a competing AMS [Insurance Business, 2026].

### 3. Leading indicators
- Agency listed on a broker site or engaged with an M&A advisor. Sellers usually stop buying new tools 6-12 months before a sale [design].
- Producer LinkedIn move, or a producer-book transfer in carrier appointment data.
- Premium or commission drop, which shows up in the sale's diligence.
- Roll-up announces a new platform in the same metro. Roll-ups often move acquired agencies to one AMS within 6-18 months of close [design].
- Owner age and succession signals.

### 4. Timing
- Acquired agencies often churn at close or at the first AMS renewal after close. HawkSoft notes that the AMS is the hardest system to change after an acquisition, so the migration is planned and can be delayed [HawkSoft blog, undated].
- Retention-based earnouts run 1-3 years in most deals, so buyers may hold the existing system until the earnout ends [acquisitionstars.com, undated; search summary].
- Notice is usually none. The acquirer decides at close.

### 5. Save tactics
- Agency-level contract tied to the earnout period, or a bundle that the buyer can add to its own platform.
- Carrier-side: multi-year contract with a carrier integration that the acquirer also depends on.
- Per-producer pricing so that producer departures do not cut the bill, and so the seller's team stays on the product during the earnout.
- Save rate [design]: 15-25% of acquired agencies, if the account is reached before the buyer's tech decision.

### 6. What a solo founder can realistically do
- Track deal flow in Insurance Business, Insurance Journal and Axios Pro. Contact the seller's team at signing, before the buyer's integration plan is fixed.
- Target agencies that are unlikely to be bought: niche lines, independent holdouts, and agencies outside active roll-up metros [design].
- Make data export and carrier-feed continuity explicit in the contract. Acquired agencies lose data when the migration is forced.
- Avoid carrier sales. Procurement and security reviews run for a year or more.

### 7. Sources
- https://www.axios.com/pro/fintech-deals/2026/02/10/equal-parts-25m-insurance-rollup (2026-02-10)
- https://www.insurancebusinessmag.com/us/news/technology/applied-systems-announces-acquisition-of-ezlynx-243576.aspx (2026)
- https://www.insurancebusinessmag.com/us/news/mergers-acquisitions/traditional-pe-rollup-model-is-running-its-course-agi-ceo-586348.aspx (date not confirmed)
- https://www.sonant.ai/blog/insurance-industry-consolidation (2025 figures, secondary)
- https://www.independentagent.com/wp-content/uploads/2026/02/26_ACT_TechTrendsReport.pdf (2026-02)
- https://blog.hawksoft.com/considerations-during-agency-acquisition-or-merge (undated)
- https://acquisitionstars.com/blog/insurance-agency-book-of-business-diligence-ma (undated)
- https://www.sec.gov/Archives/edgar/data/0001502292/000114036126019520/ef20072716_ars.pdf (FY2025 annual report; earnout structure)

---

## 3. Manufacturing plants

### 1. Churn level
- Plant-level SaaS (MES, quality, maintenance/CMMS, scheduling, shop-floor data) sold to SMB and mid-market plants: annual logo churn [design] 8-14%, revenue churn [design] 6-10%.
- Monthly-billed small shops churn faster than annual enterprise contracts [design].
- Involuntary churn: [design] 3-6% of churned logos.
- Business survival is low enough to matter. BLS Business Employment Dynamics shows about 34.7% of establishments born in 2013 still operating in 2023 [BLS TED title, 2024; figure from title, not fetched]. A third-party reading of BLS data puts 5-year survival for March 2020 establishments at 51.4% [unverified; startbusinessbystate, 2025].

### 2. Reason mix (estimated, sums to 100)
| Id | Share |
|---|---|
| business_closed (plant shut) | 14% |
| acquired_or_merged (parent moves plant to its ERP/MES) | 16% |
| consolidated_vendors | 12% |
| not_using / low_adoption (lines idled, seats fall) | 9% |
| bugs_reliability | 8% |
| budget_cut | 8% |
| champion_left | 7% |
| switched_competitor | 7% |
| missing_feature | 7% |
| onboarding_failed | 6% |
| contract_term_end_rfp | 3% |
| outgrew_product | 3% |

All shares are [design]. The plant closure wave is documented. Plant Services ran roundups from May to October 2025 listing closures such as Akebono Brake's Kentucky plant (about 450 jobs), TransAxle's 16 U.S. sites (209 jobs) and Hubbell's Illinois plant (110 jobs) [Plant Services roundups, 2025]. Closure counts are not aggregated here.

### 3. Leading indicators
- Plant shifts from two to one shift, or lines idled. Seat and station counts drop first.
- Parent company announces an ERP rollout or an acquisition. Parent-driven vendor replacement is the most common mechanism [design].
- WARN notices and layoff filings for the site.
- Champion (plant manager or ops director) leaves. Plant managers turn over more than corporate buyers.
- Usage falls on the shop floor while the admin login stays active.

### 4. Timing
- Mid-market plants usually renew annually. Closures and acquisitions interrupt at any point, so churn is less tied to renewal dates than in software-only segments [design].
- Parent-driven moves follow the parent's ERP timeline, often 12-24 months after acquisition [design].
- Notice: usually little. Plant closures are announced to employees weeks ahead, and the vendor often learns after the fact.

### 5. Save tactics
- Multi-site or corporate contract, so one plant closing does not end the account. This also helps with parent-level standardization.
- Integration with the parent's ERP (SAP, Oracle, Epicor), which creates switching cost. Gartner notes that MES buyers increasingly favor integrated suites from large ERP and OT vendors [Gartner MES market guide, undated].
- Per-line or per-site pricing with a step-down option during idle periods. Save rate [design]: 25-40% of idle-line churn.
- Save rate on acquisition-driven churn is low, under 15% [design].

### 6. What a solo founder can realistically do
- Sell to single-site independent plants, not multi-site corporates. Corporate buyers standardize on their parent's stack.
- Sell at multi-site accounts only with an ERP integration and a corporate champion.
- Watch WARN notices and the Plant Services and trade press roundups for closures in your customer list.
- Expect strategic buyers. Large industrial software deals (Emerson/AspenTech, Vista/Amtech, GE Vernova's Proficy sale to TPG) show buyers consolidating MES vendors [ABI Research; Houlihan Lokey, fall 2025].

### 7. Sources
- https://www.plantservices.com/roundup/article/55292914/factory-fallout-manufacturing-plant-closures-and-layoffs-from-chevron-transaxle-denka-and-more (2025)
- https://www.plantservices.com/roundup/article/55282707/factory-fallout-manufacturing-plant-closures-and-layoffs-from-texas-instruments-conagra-plug-power-and-more (2025)
- https://www.gartner.com/technology/media-products/newsletters/IQMS/1-3UEPFRU/gartner.html (undated)
- https://abiresearch.com/market-research/insight/7781005-rockwell-automation-and-emerson-spend-us8-?hsLang=en (2025)
- https://cdn.hl.com/pdf/2025/hl-industrial-software-market-update-2025-fall.pdf (fall 2025)
- https://www.bls.gov/opub/ted/2024/34-7-percent-of-business-establishments-born-in-2013-were-still-operating-in-2023.htm (2024; title only)
- https://startbusinessbystate.com/business-survival-rates-by-state (2025; secondary)
- https://www.vitally.io/post/saas-churn-benchmarks (2025-04-23; general benchmark)

---

## 4. Utilities

### 1. Churn level
- Vendor SaaS sold to utilities (billing/CIS, outage and work management, GIS and asset software, customer comms) runs on multi-year terms. Annual logo churn [design] 3-6%, revenue churn [design] 2-4%.
- Municipal and public-power utilities churn at re-procurement, not monthly.
- Involuntary churn: [design] under 3%. Public buyers pay by invoice through AP, and failed payments are rare.
- Procurement records show 5-year initial terms with 1-year extension options. A UK water utility award runs 2025-2030 with extensions to 2035 [UK Find a Tender, 2025]. A Fresno billing system renewal authorizes three one-year extensions with increases capped at 10% [Fresno council record, 2024].

### 2. Reason mix (estimated, sums to 100)
| Id | Share |
|---|---|
| contract_term_end_rfp (forced rebid) | 22% |
| acquired_or_merged (utility or municipal merger) | 14% |
| consolidated_vendors (suite replacement) | 12% |
| budget_cut (rate case or council budget) | 10% |
| regulation_change (PUC or reliability rules) | 10% |
| security_or_compliance (NERC CIP, state security rules) | 8% |
| switched_competitor | 8% |
| missing_feature | 5% |
| poor_support | 5% |
| champion_left | 4% |
| bugs_reliability | 2% |

All shares are [design]. The consolidation pattern is documented in procurement: Yarra Ranges Council replaced three systems with one SaaS suite on a five-year, $7.3M contract [Yarra Ranges record, undated; search summary]. Everest Group reports that vendor consolidation is spreading across verticals [Everest Group, undated].

### 3. Leading indicators
- Public RFI or RFP posted on a procurement portal (Find a Tender, SAM.gov, state portals, council agendas) for a category the vendor sells.
- Council or board agenda items about an "extension" or "re-procurement" 6-18 months before expiry.
- Rate case filings, new utility CIO or CFO, or a utility merger announcement.
- A regulatory audit or cyber finding that triggers a security rebid.
- Extension clause approaching its end date.

### 4. Timing
- Churn happens at term end. Most vendors see notice through the public RFP, which can come 9-18 months ahead [vendor guidance, unverified].
- Municipal fiscal years often end June 30, and budget cycles drive timing [design].
- Extensions are common. Wollongong NSW extended a seven-year SaaS contract that expired in September 2025 instead of re-procuring [Wollongong council, 2025].

### 5. Save tactics
- Early extension offered before the RFP, with a capped annual increase. Extensions are a deliberate alternative to re-procurement (Wollongong, Fresno).
- Integration with GIS, ERP or the utility's billing system, which raises switching cost.
- Compliance attestation (SOC 2, NERC-aligned controls) that a rebid would require anyway. Save rate [design]: 40-60% of extensions when the vendor offers early renewal before the RFP.
- Save rate on an open RFP is low, [design] under 25%, because incumbents rarely win a rebid on price alone.

### 6. What a solo founder can realistically do
- Use public procurement portals to find renewal windows. Target small municipal utilities and co-ops, which buy through state purchasing schedules.
- Get on cooperative contracts so buyers can use you without a full RFP.
- Get SOC 2 and state-level security documentation before any public bid. Missing attestations are the usual disqualifier [design].
- Do not bid on large RFPs against incumbents. Expect a 12-18 month sales cycle [design].

### 7. Sources
- https://www.find-tender.service.gov.uk/Notice/009966-2025/PDF (2025)
- https://agendas.fresno.gov/en/legislation/id-24-1489-18776 (2024)
- https://www.wollongong.nsw.gov.au/__data/assets/pdf_file/0035/269657/Item-3-Extension-of-Contract-One-Council-Enterprise-Software.pdf (2025)
- https://www.arnnet.com.au/?p=1256290 (Yarra Ranges award; date not confirmed)
- https://www.everestgrp.com/?p=4365 (undated; general consolidation claim)
- https://www.gartner.com/en/documents/6179355 (2025-02; SaaS renewal toolkit, paywalled)
- https://www.find-tender.service.gov.uk/Notice/082251-2025 (2025-12; Microsoft direct award, UK water utility)
