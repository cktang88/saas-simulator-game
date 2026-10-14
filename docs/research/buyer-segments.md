# Buyer segments: research synthesis for the founder simulator

Compiled 2026-10-14 from nine research notes (`docs/research/buyer-segments/g1..g9`, copied unchanged). The data shipped to the game lives in `public/data/buyer-segments.js`; the founder-facing playbook is `.claude/skills/founder-selling-to-segments/SKILL.md`.

**How to read the numbers.**
- **Sourced** facts carry a URL and date (as given in the notes). Where the notes only saw a snippet, a vendor page or a secondary aggregator, it says so.
- **[design]** marks an estimate made in the research notes or by this synthesis. Almost every cycle length, committee count, win rate, card limit and churn rate for these verticals is [design]: no independent source publishes them. Never show a [design] number to a player as a real statistic.
- **[unverified]** flags are preserved from the notes: the figure appears only in vendor or secondary sources that could not be traced to a primary report.
- The notes cover **30** segments (the brief said 29): g1 3, g2 3, g3 3, g4 4, g5 4, g6 4, g7 4, g8 5. All 30 are in the data.

## 1. Cross-segment findings

### 1.1 Buying-group size
| Claim | Value | Source | Status |
|---|---|---|---|
| Group size range | 5 to 16 people across up to 4 functions (632 buyers, fielded Aug-Sep 2024) | Gartner press release, 2025-05-07 | primary |
| Internal + external participants | 13 internal + 9 external per B2B purchase; GenAI features roughly double the group | Forrester, *State of Business Buying 2026* | secondary |
| By company size | SMB 3.1, mid-market 6.8, enterprise 11.2 (attributed to Forrester 2024; another page of the same site gives 14-23 above $1M, attributed to Forrester 2023) | Starr Conspiracy 2025 | [unverified], internally conflicting |
| Won mid-size deals | A won $50K-$250K deal typically involves at least 10 stakeholders; won deals have at least 3 buyer participants in meetings, lost deals often one | Gong blog, 2026 | secondary, correlational |
| "6 to 10" buyers | Cited on Gartner slides and 2025 benchmark pages | none found | [unverified] |

**Resolution.** Forrester's 13 + 9 counts everyone who touches a purchase, including advisors and external parties, so it is an upper bound, not a committee. The game uses Gartner's 5-16 for enterprise deals and Starr-style scaling for smaller ones, then caps it by owner-led reality: the planning bands in `CROSS_SEGMENT.buyingGroup.byAcv` are 1-2 people under $5k, 2-4 at $5-25k, 4-7 at $25-100k and 7-12 above $100k [design]. Owner-led segments (retail, salons, trades, solo practitioners) are 1-3 people regardless of sticker price. Per-segment committees are in section 3 and sampled by `committeeFor()`.

### 1.2 Consensus and conflict
Gartner (2025-05-07, primary): 74% of buyer teams show unhealthy conflict during the decision; teams that reach consensus are 2.5x more likely to rate the deal high quality; group-relevant content raised consensus 20% while individual-level content lowered it 59%. Implication for the game: a single enthusiastic contact is not consensus. Give every stakeholder material that speaks to the group, not only to the champion.

### 1.3 No-decision rate
No verified primary figure exists. Secondary claims: about 40% of B2B journeys end in no decision (attributed to Gartner, Mediafly, undated), "roughly half" of qualified opportunities (attributed to Gartner, Boomerang, undated), 59% (attributed to Forrester, Sproutworth, undated) and about 40% abandoned for lack of group agreement (LinkedIn/Bain via CB News, undated). All **[unverified]**.
**Planning value: 40-50% of qualified deals end without a purchase [design]**, and it is the largest loss reason in most B2B funnels. Segment `winRateQualified` values (0.15-0.28) already net out no-decision, so the game should not subtract it a second time.

### 1.4 Multithreading and champion loss
- Gong Labs (about 1.8 million opportunities closed in 2024, reported via secondary summaries): multithreaded deals over $50K show about a **130% win-rate lift**; closed-won deals show **67% more buyer contacts** than closed-lost; won deals average 6.7 selling-team members by the end of discovery. Some summaries say "roughly twice" the contacts, which conflicts with 67%. All associations, not causal effects.
- **Rejected:** the "3x multiplier" repeated on many blogs (no primary source) and "73% of champions fail to close deals" (no traceable source).
- **Resolution.** A +130% win rate is almost certainly selection (healthy deals attract more contacts). The game uses a capped, discounted effect: multiplier on close probability of 0.7 with one engaged contact, 1.0 with two, 1.15 with three, 1.25 with four or more [design] (`CROSS_SEGMENT.multithreadWinLift.simWinMultByContacts`).
- **Champion turnover:** no verified study. GrowthSpree's "8% of churn is champion change" has an unknown source ([unverified]). Planning hazard: 6-12% per 90 days of cycle [design]; segment scenario probabilities of 10-25% per deal are consistent with that. "Second champion named" is the leading indicator.

### 1.5 Rep-free buying
- **61%** of B2B buyers prefer an overall rep-free buying experience; 73% avoid suppliers whose outreach seems irrelevant; 69% report inconsistencies between a seller's website and what sellers say (Gartner, 632 buyers, press release 2025-06-25, primary). A later survey (646 buyers, Aug-Sep 2025) reports **67%** (Digital Commerce 360, 2026-03-17, secondary).
- 6sense 2025 (release 2025-11-12, returned HTTP 403 so only search summaries were seen, **[unverified]**): independent research vs seller engagement moved from 70/30 to 60/40; first seller contact at 61% of the process (down from 69%); cycle about 10 months (from 11); the vendor a buyer prefers before sales contact wins about 80% of deals. UK/Ireland: 57% (MarketOne 2025, secondary).
- **Game use.** Owner-led segments are effectively rep-free already (card, trial, marketplace). For committee segments, shortlist formation happens before the founder is invited, so content, reviews, a trust centre and a reference customer matter before the first call, and a first meeting can arrive with the buyer's mind half made up.

### 1.6 Vendor paperwork: what it costs a small vendor
Costs, hours and days below are the ranges stored in `PAPERWORK`. Sources are 2025-2026 vendor and consultant pages (g9); hours are mostly [design].

| Item | Cost (US$) | Elapsed | Founder hours | Notes and conflicts |
|---|---|---|---|---|
| SOC 2 Type I | $15,000-$40,000 (+$7,500-$15,000/yr) | 90-120 d | 60-120 h | Platform (Vanta/Drata) about $7.2k-$15k/yr, auditor $5k-$25k, 3-4 months from kickoff. Vendor guides, [unverified]. |
| SOC 2 Type II | $30,000-$80,000 (+$20,000-$50,000/yr) | 180-365 d | 120-300 h | Auditor $15k-$50k (another guide $7k-$100k); whole program $30k-$80k; observation window 3-12 months, 6 typical; renewals +20-30% [unverified]. Chose the narrow $30k-$80k. |
| Penetration test letter | $5,000-$30,000 (+$5,000-$20,000/yr) | 21-56 d | 15-50 h | $5k-$30k; tight single app $5k-$10k, web + API $15k-$35k (Autonoma 2026). Chose $5k-$30k. |
| SIG Lite questionnaire | staff time | 5-10 d | 12-20 h | 126-200 questions depending on version; first time 12-20 h, repeat 2-4 h [design]. |
| CAIQ (Cloud Security Alliance) | staff time | 5-10 d | 8-16 h | About 260-300 yes/no questions [unverified]; 8-16 h first time [design]. |
| Custom security questionnaire | staff time | 5-15 d | 8-30 h | 12-18 h (Wolfia) vs 20-40 h (Secureframe), vendor figures [unverified]; chose 8-30 h. |
| HECVAT (higher-ed security assessment) | staff time | 28-84 d | 15-30 h | Review turnaround 5-10 business days (Montclair) to 4-12 weeks (Toledo); hours not found [design]; reusable across schools. |
| VPAT / Accessibility Conformance Report | $350-$6,000 | 28-56 d | 20-60 h | 4-8 weeks with an outside firm; $350 for the ACR plus an audit fee [unverified]; remediation can add 40-120 h. |
| HIPAA Business Associate Agreement | $0-$3,000 | 7-84 d | 2-6 h | No turnaround data found; 1-2 weeks from your template, 4-12 weeks with customer paper [design]. |
| Data processing agreement | $0-$1,500 | 7-28 d | 1-6 h | No sourced cost or time [design]. |
| Student data privacy agreement (SDPC NDPA) | staff time | 3-90 d | 4-10 h | 130,000+ signed DPAs across 12,000+ districts and 6,674 providers; v2.2 published 2025-11-19; one signature can extend within a state alliance. |
| Certificate of insurance (GL, E&O, cyber) | $0-$500 (+$2,500-$10,000/yr) | 1-5 d | 1-4 h | Typical asks $1M GL/$2M aggregate, $1M E&O, $1M cyber (Larimer County); $2M-$5M is common for SMB vendors, $10M+ for larger (Morgan Lewis, Sep 2025). Premiums [design]. |
| Supplier portal registration (Ariba, Coupa, city/state portal) | staff time | 5-28 d | 1-4 h | Ariba: one customer reports 7 days vs 3 months before; Coupa not found. |
| Cooperative contract award (Sourcewell, OMNIA, NASPO ValuePoint) | $0-$2,000 | 120-270 d | 40-120 h | Sourcewell admin fee 1-1.5% (sample clauses) or 1-2% (glossary) [unverified]; OMNIA fee not found. |
| GovRAMP (formerly StateRAMP) status | $3,000-$25,000 (+$1,500-$7,500/yr) | 90-365 d | 40-100 h | PMO fees effective 2025-01-01: snapshot $1k-$2.5k, annual review $500-$7.5k, monitoring from $250/month; third-party gap analysis $10k-$150k [unverified]; no reliable authorization timeline. |
| FedRAMP authorization (Moderate) | $250,000-$1,500,000 (+$100,000-$400,000/yr) | 365-1095 d | 1500-6000 h | Conflict: $250k-$1M+ (g8, design), $250k-$2M and $500k-$4M (g9, consultants, unverified); 12-36 months. Chose $250k-$1.5M. A founder without a federal pipeline should not start. |

### 1.7 Methodologies and what a call can reveal
Only MEDDPICC was checked against 2024-2026 sources (vendor explainers). The other methods are standard practice summarised from the notes and carry no numbers. The six scorecard flags in `scorecard.js` (metrics, economicBuyer, decisionCriteria, decisionProcess, pain, champion) map onto MEDDICC; `paperProcess` and `competition` are added. In a call transcript, **pain, decision criteria, decision process, paper process, competition and champion behaviour** are usually visible; **metrics and the economic buyer** are only partly visible and need a follow-up; budget and signature authority usually cannot be confirmed from the call. Use BANT under about $5k with one decision-maker, value selling for owner-led deals, MEDDICC for $10-50k, MEDDPICC from about $25k or whenever a security, legal or procurement step exists (all [design]).

### 1.8 Dates and thresholds that change the plan
- **US federal:** micro-purchase threshold $10,000 to $15,000 and simplified acquisition threshold $250,000 to $350,000 from 2025-10-01 (final rule 2025-08-27; check FAR 2.101). Fiscal year starts Oct 1; Q4 (Jul-Sep) is the spend rush (DoD obligated $93.4B in Sep 2025, $50.1B in the last five working days). SBIR/STTR lapsed about six months after 2025-09-30 and were reauthorised through 2031-09-30 on 2026-04-13.
- **States and cities:** 46 states start the fiscal year on July 1 (NCSL), so budgets are set Jan-Jun. North Carolina requires GovRAMP from 2026-04-01 (full 2027-04-01); Arizona renewals from 2026-07-01.
- **Schools:** amended COPPA rule effective 2025-06-23, compliance due 2026-04-22; ESSER money is gone (2026-08); about 80% of K-12 purchases close May-July (secondary).
- **Health:** HIPAA Security Rule NPRM comment period closed 2025-03-07, not final as of 2026-10; plan as if it will be.
- **Utilities:** NERC CIP-013-4 draft in ballot October 2026; verify status.
- **Accounting:** FTC Safeguards Rule (16 CFR 314) treats tax preparers as financial institutions.

## 2. Comparison table (all 30 segments)

Cycle, win rate and committee are [design] unless the segment section says otherwise. "Cycle at typical ACV" uses the band containing the geometric mean of the ACV range. Committee = distinct roles / non-user people sampled at typical ACV by `committeeFor()`. Solo-founder fit is 0-1.

| Segment (id) | Group | ACV | Cycle at typical ACV (days) | Win | Committee | Method | Solo fit | Key paperwork |
|---|---|---|---|---|---|---|---|---|
| Mom-and-pop independent retail (`retail_shops`) | owner_smb | $200-$1.5k | 1-14 (lt5k) | 27% | 2.8 / 2.2 | Value selling | 0.6 | none (W-9 at most) |
| Independent restaurants and small groups (`restaurants`) | owner_smb | $1k-$6k | 1-14 (lt5k) | 22% | 2.9 / 2.4 | Value selling | 0.5 | pci attestation, soc2 type2, dpa |
| Salons, spas and boutique fitness studios (`salons_fitness`) | owner_smb | $300-$6k | 1-14 (lt5k) | 25% | 3.1 / 2.8 | Value selling | 0.6 | pci attestation, security questionnaire, dpa |
| Trades and specialty subcontractors (roofing, HVAC, plumbing, electrical) (`trades`) | owner_smb | $600-$5k | 1-21 (lt5k) | 22% | 3.2 / 3.0 | Value selling | 0.6 | security questionnaire, dpa, soc2 type2 |
| Trucking and logistics fleets (owner-operators to mid-size carriers) (`trucking`) | owner_smb | $150-$6k | 1-14 (lt5k) | 25% | 2.9 / 2.9 | Value selling | 0.6 | security questionnaire, dpa |
| General contractors and mid-size construction firms (`general_contractors`) | company | $10k-$60k | 30-90 (k5to25) | 20% | 6.5 / 6.5 | MEDDPICC | 0.25 | msa redlines, security questionnaire, dpa |
| Independent dental, medical and veterinary practices (and DSO sites) (`health_practices`) | health | $1.5k-$12k | 1-14 (lt5k) | 25% | 3.4 / 2.6 | Value selling | 0.65 | hipaa baa, security questionnaire, dpa |
| Hospitals and health systems (`hospitals`) | health | $20k-$100k | 180-365 (k25to100) | 20% | 7.8 / 15.1 | MEDDPICC | 0.25 | hipaa baa, security questionnaire, soc2 type2 |
| Pharma, biotech and life-sciences companies (GxP) (`pharma`) | health | $15k-$80k | 180-270 (k25to100) | 20% | 7.0 / 8.6 | MEDDPICC | 0.2 | security questionnaire, soc2 type2, supplier audit |
| Law firms (solo and small through AmLaw 200) (`law_firms`) | professional | $1.5k-$30k | 30-75 (k5to25) | 20% | 2.4 / 2.2 | Value selling | 0.65 | soc2 type2, security questionnaire, sig lite |
| Accounting and CPA firms (`accounting_firms`) | professional | $2k-$15k | 30-60 (k5to25) | 20% | 2.9 / 2.1 | Value selling | 0.45 | ftc safeguards wisp, dpa, security questionnaire |
| Real estate agents and brokerages (`real_estate`) | professional | $600-$30k | 1-14 (lt5k) | 18% | 2.1 / 2.1 | Value selling | 0.5 | security questionnaire, mls data use review, dpa |
| Marketing and creative agencies (`agencies`) | professional | $600-$30k | 7-30 (lt5k) | 20% | 2.8 / 3.1 | Value selling | 0.65 | dpa, security questionnaire, soc2 type2 |
| E-commerce and DTC brands (Shopify ecosystem) (`ecommerce`) | company | $300-$3k | 1-14 (lt5k) | 20% | 3.3 / 2.6 | Value selling | 0.8 | dpa, security questionnaire |
| Startups and tech SMBs (10-100 employees, PLG and self-serve) (`startup_smb`) | company | $3k-$30k | 14-45 (k5to25) | 25% | 3.3 / 2.3 | MEDDPICC | 0.7 | security questionnaire, dpa, soc2 type2 |
| Mid-market companies (100-1,000 employees) (`mid_market`) | company | $10k-$60k | 30-75 (k5to25) | 20% | 5.5 / 6.0 | MEDDPICC | 0.45 | soc2 type2, dpa, msa redlines |
| Fortune 500 and large enterprise (`enterprise`) | company | $25k-$250k | 120-180 (k25to100) | 15% | 7.8 / 10.1 | MEDDPICC | 0.12 | msa redlines, vendor portal, soc2 type2 |
| Hotels and hospitality groups (`hotels`) | company | $3k-$25k | 30-90 (k5to25) | 22% | 3.7 / 2.8 | Value selling | 0.6 | pci attestation, dpa, soc2 type2 |
| Franchise systems (franchisors and franchisees) (`franchise_systems`) | company | $1k-$50k | 30-90 (k5to25) | 20% | 2.4 / 1.8 | MEDDPICC | 0.3 | dpa, security questionnaire, msa redlines |
| Banks, credit unions and financial services (`banks`) | regulated | $5k-$30k | 45-120 (k5to25) | 20% | 5.6 / 5.0 | MEDDPICC | 0.35 | soc2 type2, dpa, sig lite |
| Insurance agencies and carriers (`insurance`) | regulated | $1.5k-$12k | 7-30 (lt5k) | 25% | 3.7 / 2.8 | Value selling | 0.6 | soc2 type2, dpa, sig lite |
| Manufacturing plants (`manufacturing`) | regulated | $8k-$40k | 45-120 (k5to25) | 20% | 5.1 / 5.1 | MEDDPICC | 0.3 | security questionnaire, ot security questionnaire, soc2 type2 |
| Utilities (electric, water, gas; co-ops and municipals) (`utilities`) | regulated | $10k-$80k | 120-270 (k25to100) | 20% | 5.7 / 5.2 | MEDDPICC | 0.2 | security questionnaire, vendor portal, soc2 type2 |
| City and county government (`local_gov`) | public | $3k-$30k | 14-56 (k5to25) | 28% | 4.5 / 4.6 | Value selling | 0.5 | vendor portal, security questionnaire, dpa |
| State government agencies (`state_gov`) | public | $15k-$150k | 90-270 (k25to100) | 22% | 6.7 / 6.2 | MEDDPICC | 0.25 | vendor portal, vpat, security questionnaire |
| Federal government (civilian and defense) (`federal`) | public | $25k-$200k | 30-120 (k25to100) | 15% | 6.6 / 6.2 | MEDDPICC | 0.2 | sam registration, vpat, security questionnaire |
| K-12 school districts (`k12`) | education | $4k-$35k | 60-150 (k5to25) | 21% | 5.7 / 7.8 | MEDDPICC | 0.35 | sdpc ndpa, security questionnaire, vpat |
| Colleges and universities (`higher_ed`) | education | $3k-$25k | 45-120 (k5to25) | 21% | 6.8 / 6.8 | MEDDPICC | 0.3 | hecvat, vpat, dpa |
| Nonprofits and associations (`nonprofits`) | nonprofit | $500-$6k | 1-14 (lt5k) | 22% | 3.8 / 3.7 | Value selling | 0.6 | nonprofit verification, board packet, dpa |
| Churches and religious organizations (`churches`) | nonprofit | $300-$3k | 14-90 (lt5k) | 20% | 4.1 / 4.6 | Value selling | 0.7 | child safety policy, dpa, pci attestation |

## 3. Segments

Each section: sourced facts (URL and date as in the notes), then the [design] estimates stored in the data, then the choices made where notes conflict or were implausible.

### Group: owner_smb

#### Mom-and-pop independent retail (`retail_shops`)

Employees 1-15; models smb. Examples: boutique apparel shop; florist; bike shop; pet store; independent bookstore.

**Sourced**
- SBA: 36.2 million US small businesses, ~46% of private-sector employment (https://advocacy.sba.gov/?p=30239, 2025)
- Census 2022 nonemployer statistics published 2024-12-12 (https://www.census.gov/newsroom/press-releases/2024/2022-nonemployer-statistics.html)
- i2c/PYMNTS survey of 583 SMBs: nearly half say credit limit influences which card is top of wallet (https://www.i2cinc.com/smbs-rely-on-business-and-personal-credit-cards-for-growth/, 2025)

**[design] estimates stored in the data**
- ACV $200-$1.5k; qualified win rate 27%; annual churn 30%; buyer is the user 60% of the time.
- Cycle days: <$5k 1-14; $5-25k 14-45; $25-100k 45-120; >$100k 120-270.
- Committee at typical ACV: about 2.8 roles and 2.2 non-user people. Roles that can block: owner spouse (0.6), champion (0.5), finance (0.4).
- Procurement: card limit $2k; quotes from none; RFP from none; board approval 0% above none; fiscal year starts month 1; budgets set in months 11, 12, 1; payment card or prepaid.
- Paperwork (probability, from ACV): w9 3%.
- Method: **Value selling**, critical elements pain, metrics. A $30/month decision needs three questions and a before/after number, not BANT. Price as less than a coffee a day; offer a trial or 30-day refund.
- Most likely scenarios: I'll think about it (40%); Buyer is not the user (35%); Spouse or partner vetoes (20%).
- Seasonality: busy months 9, 10, 1, slow 7, 8, 11, 12. Holiday rush freezes owners Nov-Dec; January tax-season cash crunch spikes churn; tourist towns are busy in Jul-Aug.
- Solo-founder fit: **0.6**.

**Choices and flags.** All process numbers are [design]; the notes found no independent source for retail cycle, committee or win rate. Churn: the 10-14% aggregator figure (ChartMogul 2025 via gtm8020, secondary) is for SMB SaaS in general; used the notes' [design] 25-35% because shop closures dominate. >$100k cycle is filler: the segment cannot produce such deals.

#### Independent restaurants and small groups (`restaurants`)

Employees 3-400; models smb. Examples: neighbourhood bistro; taqueria; pizza shop; three-restaurant hospitality group.

**Sourced**
- Technomic: 412,498 independent restaurant locations at end of 2025 vs 422,001 in 2024 (-2.3%) (https://www.nrn.com/independent-restaurants/the-independent-restaurant-sector-shrunk-by-2-3-in-2025, 2026-02-24)
- BlueStar survey of 72 operators: >50% used their POS for 5+ years and nearly half would not consider changing; at least 12 said the POS decision was not theirs (https://nation.bluestarinc.com/articles/we-asked-72-restaurant-owners-about-their-point-of-sale-system, 2023-02-15)
- NRA: restaurant industry employs 15.9 million (https://restaurant.org/research-and-media/media/press-releases/restaurant-industry-poised-for-growth-in-2025-industry-expected-to-employ-15-9-million-people-and-r/, 2025-02-06)

**[design] estimates stored in the data**
- ACV $1k-$6k; qualified win rate 22%; annual churn 20%; buyer is the user 60% of the time.
- Cycle days: <$5k 1-14; $5-25k 14-45; $25-100k 45-120; >$100k 120-240.
- Committee at typical ACV: about 2.9 roles and 2.4 non-user people. Roles that can block: group ops (0.8), franchisor (0.8), finance (0.5), technical (0.5).
- Procurement: card limit $5k; quotes from $10k; RFP from none; board approval 0% above none; fiscal year starts month 1; budgets set in months 10, 11, 12; payment card or prepaid.
- Paperwork (probability, from ACV): w9 40%, pci_attestation 50%, coi_insurance 20%, soc2_type2 35% (>= $25k), dpa 35% (>= $25k).
- Method: **Value selling**, critical elements economicBuyer, pain, metrics. Anchor on food-cost or labour percentage. Find the owner before the demo, never demo to the GM and assume the owner agreed. MEDDPICC for groups.
- Most likely scenarios: Buyer is not the user (40%); POS integration unsupported (20%); Group corporate blocks (15%).
- Seasonality: busy months 9, 10, 1, 2, slow 6, 7, 8, 12. Independents fell 2.3% in 2025 (Technomic), so closure churn is structural. December service freezes buying.
- Solo-founder fit: **0.5**.

**Choices and flags.** Toast's own survey (40% consider Toast when switching) is vendor-sourced and not used. Katalystos's "Toast pay-as-you-go is tied to a 2-year agreement" is flagged "verify" in the note and not used. Churn 20% sits between the notes' 15-25% (independents) and 8-12% (groups).

#### Salons, spas and boutique fitness studios (`salons_fitness`)

Employees 1-30; models smb. Examples: 2-chair hair salon; day spa; yoga studio; HIIT studio with 3 locations.

**Sourced**
- 84,176 employer salon establishments with 391,064 employees in 2023, plus 838,264 nonemployer businesses (https://startbusinessbystate.com/salon-industry-statistics/, undated, third-party Census compilation)
- DaySmart/Researchscape survey of 590+ owners: scheduling, automated communication and POS top priorities; budget and expertise top barriers (https://www.americanspa.com/business/study-shows-56-salons-spas-use-business-management-software, 2019)
- Mindbody-class tools quoted at $99-$699 per location per month, 24-month standard term (https://withorbital.com/data/software/mindbody/, undated, unverified)

**[design] estimates stored in the data**
- ACV $300-$6k; qualified win rate 25%; annual churn 22%; buyer is the user 60% of the time.
- Cycle days: <$5k 1-14; $5-25k 14-45; $25-100k 45-120; >$100k 120-240.
- Committee at typical ACV: about 3.1 roles and 2.8 non-user people. Roles that can block: franchisor (0.8), champion (0.5), finance (0.4), end user group (0.2).
- Procurement: card limit $3k; quotes from none; RFP from none; board approval 0% above none; fiscal year starts month 1; budgets set in months 11, 12, 1; payment card or prepaid.
- Paperwork (probability, from ACV): w9 20%, pci_attestation 50%, security_questionnaire 20% (>= $25k), dpa 20% (>= $25k).
- Method: **Value selling**, critical elements metrics, pain, champion. Revenue-per-chair or per-class and no-show counts make the number. SPIN works for the owner conversation. The front-desk manager's buy-in is a must.
- Most likely scenarios: Front desk loves it, owner worries about cost (35%); Mindbody or Vagaro contract lock-in (30%); Booth renters refuse to move clients (25%).
- Seasonality: busy months 1, 2, 3, 8, 9, slow 7, 11. Fitness resolutions in January; wedding planning Feb-Mar for salons; holiday rush freezes salons late Nov-early Dec. California AB 5 changed booth-renter status for nail techs from 2025-01-01.
- Solo-founder fit: **0.6**.

**Choices and flags.** Mindbody pricing ($99-$699 per location per month, 24-month term) comes from a data vendor, undated, [unverified]. The 2019 DaySmart survey is dated; it is used only for the "scheduling, communication and POS first; budget and expertise are barriers" ordering. Churn 22% blends the notes' 15-25% (booking tools) and 25-35% (solo-stylist tools).

#### Trades and specialty subcontractors (roofing, HVAC, plumbing, electrical) (`trades`)

Employees 2-50; models smb. Examples: 6-truck residential HVAC shop; 12-person roofing crew; 3-van plumbing company; 20-person electrical sub.

**Sourced**
- Costbench: median annual cost $699 for Jobber (46 deals) and $4,400 for Housecall Pro (11 deals), small samples (https://www.costbench.com/compare/housecall-pro-vs-jobber/, 2026)
- TechCrunch: many HVAC owners still use pen and paper and PE roll-ups are consolidating the trades (https://techcrunch.com/2024/09/30/airship-wants-to-build-better-sales-tools-for-hvac-contractors, 2024-09-30)
- WebFX via Stacker: HVAC search demand swings 250-600% peak to valley (https://krdo.com/stacker-small-business/2026/02/19/seasonal-search-shifts-in-home-services-demand-what-spikes-when-and-how-to-stay-booked-year-round/, 2026-02-19)

**[design] estimates stored in the data**
- ACV $600-$5k; qualified win rate 22%; annual churn 32%; buyer is the user 35% of the time.
- Cycle days: <$5k 1-21; $5-25k 14-45; $25-100k 45-120; >$100k 90-180.
- Committee at typical ACV: about 3.2 roles and 3.0 non-user people. Roles that can block: rollup corporate (0.7), champion (0.5), finance (0.4), owner spouse (0.3).
- Procurement: card limit $5k; quotes from none; RFP from none; board approval 0% above none; fiscal year starts month 1; budgets set in months 10, 11, 12; payment card or prepaid.
- Paperwork (probability, from ACV): w9 10%, coi_insurance 5%, security_questionnaire 50% (>= $25k), soc2_type2 30% (>= $25k), dpa 40% (>= $25k).
- Method: **Value selling**, critical elements pain, economicBuyer, champion. Light MEDDIC: owner is the economic buyer, office manager the champion. 20-minute owner demo tied to dollars per month; test the QuickBooks sync in the first demo.
- Most likely scenarios: Office manager loves it, owner says no (35%); Seasonal stall (30%); Techs used a free tier; owner must convert (20%).
- Seasonality: busy months 1, 2, 3, 9, 10, slow 6, 7, 8, 12. HVAC search demand swings 250-600% peak to valley; owners are too busy in summer to buy; cash is tight in fall and winter after the busy season.
- Solo-founder fit: **0.6**.

**Choices and flags.** No sourced trades cycle exists, so cycles are [design]. The ServiceTitan 2025 survey (1,020 owners above $1M revenue) is above this segment's size band and is not used for numbers. Costbench medians ($699 Jobber, $4,400 Housecall Pro) rest on 46 and 11 deals, so ACV range is anchored on them but not derived from them. Keywords include "construction" and "contractor" so a small construction company routes here and a 50+ person one routes to general_contractors by employee band.

#### Trucking and logistics fleets (owner-operators to mid-size carriers) (`trucking`)

Employees 1-500; models smb. Examples: single-truck flatbed owner-operator; 6-truck reefer carrier with a dispatcher; 40-truck dry van fleet with a safety manager.

**Sourced**
- ATA: 91.5% of carriers run 10 or fewer trucks, 99.3% under 100; industry revenue $906B in 2024 vs $1.004T in 2023 (https://www.truckersnews.com/news/article/15754113/briefly-atas-american-trucking-trends-report-now-available, 2025)
- Fleetworthy 2025 survey (300 respondents, vendor): 35% of owner-operators considered ceasing operations because of compliance workload; 22% spend 10+ hours a month on it (https://fleetworthy.com/?p=7333, 2025-01)
- Tech.co 2025: 48% of owner-operators changed their business model for new technology vs 63% of logistics managers (https://tech.co/article/logistics/logistics-report-2025, 2025)

**[design] estimates stored in the data**
- ACV $150-$6k; qualified win rate 25%; annual churn 30%; buyer is the user 60% of the time.
- Cycle days: <$5k 1-14; $5-25k 14-60; $25-100k 60-150; >$100k 90-240.
- Committee at typical ACV: about 2.9 roles and 2.9 non-user people. Roles that can block: champion (0.5), compliance (0.5), customer (0.5), finance (0.4).
- Procurement: card limit $3k; quotes from none; RFP from none; board approval 0% above none; fiscal year starts month 1; budgets set in months 10, 11, 12, 1; payment card or prepaid.
- Paperwork (probability, from ACV): w9 30%, coi_insurance 40% (>= $10k), security_questionnaire 30% (>= $25k), dpa 30% (>= $25k).
- Method: **Value selling**, critical elements pain, metrics, champion. Simple dollar ROI (hours saved x rate); Sandler-style pain-first questions fit a fast-buying owner. MEDDIC-lite for mid-size fleets with safety and finance mapped on call one.
- Most likely scenarios: Driver app adoption fails (30%); Mid-size safety director blocks on DQ-file or ELD integration (25%); Owner-op buys then churns (20%).
- Seasonality: busy months 1, 2, slow 10, 11, 12. Freight peak in Q4 and the holidays leaves owners no time; evaluate in Jan-Feb. Owner-operators churn when freight drops.
- Solo-founder fit: **0.6**.

**Choices and flags.** Fleetworthy's infographic and press release disagree on some figures and Fleetworthy is a vendor, so only the headline numbers are kept as "self-reported". The InMotion 2018 TMS-adoption figures (about a third of carriers under 10 trucks) are dated and had no URL, so they are not used. Solo fit is 0.8 for owner-operators, 0.6 for small fleets and 0.15 for mid-size; the segment value 0.6 reflects the small-fleet wedge the data is calibrated on.

### Group: company

#### General contractors and mid-size construction firms (`general_contractors`)

Employees 50-1000; models smb + ent. Examples: regional commercial GC with 200 staff and 30 active jobs; 400-person mechanical contractor; 600-person civil and site contractor.

**Sourced**
- Construction SaaS averages 147 days to close vs 67 days for general SaaS (https://saashero.net/strategy/construction-saas-pipeline-acceleration/, 2026-09-03, consultant claim, unverified)
- Dodge/CMiC: 72% of contractors expect negative impacts from policy and cost pressures (https://www.businesswire.com/news/home/20260504513164/en/New-Study-72-of-Contractors-Expect-Negative-Impacts-from-Policy-and-Cost-Pressures-Yet-Optimism-Holds-for-2026, 2026-05-04)
- Subcontractor insurance norms: GL $1M/$2M, auto $1M, umbrella $1M-$5M (https://construction.aca.alkemeins.com/construction/resources/subcontractor-insurance/, 2026-04); software-vendor use is [design]

**[design] estimates stored in the data**
- ACV $10k-$60k; qualified win rate 20%; annual churn 11%; buyer is the user 25% of the time.
- Cycle days: <$5k 14-45; $5-25k 30-90; $25-100k 90-180; >$100k 150-270.
- Committee at typical ACV: about 6.5 roles and 6.5 non-user people. Roles that can block: champion (0.7), finance (0.6), technical (0.5), security (0.5).
- Procurement: card limit $5k; quotes from $25k; RFP from $100k; board approval 10% above $250k; fiscal year starts month 1; budgets set in months 10, 11, 12; payment net-45, PO required.
- Paperwork (probability, from ACV): w9 90%, coi_insurance 60%, vendor_portal 35% (>= $25k), security_questionnaire 55% (>= $25k), sig_lite 30% (>= $25k), soc2_type2 40% (>= $50k), dpa 45% (>= $25k), msa_redlines 60% (>= $25k).
- Method: **MEDDPICC**, critical elements metrics, champion, decisionProcess, paperProcess. Long multi-threaded deals: map economic buyer, champion, paper process and security criteria early; write a mutual action plan with a pilot and success criteria.
- Most likely scenarios: Security questionnaire stalls late (35%); Pilot works but expansion stalls (30%); Forced RFP above the company threshold (20%).
- Seasonality: busy months 10, 11, 1, 2, 3, slow 6, 7, 8, 12. Budget and planning season Q4 to March; summer is slow in northern regions; Dec holidays.
- Solo-founder fit: **0.25**.

**Choices and flags.** The 147-day construction-SaaS cycle (saashero, 2026-09-03) is a consultant claim and the devcommx table "looks like one repeated template", so both are only directional anchors; cycle bands are [design]. COI minimums ($1M/$2M GL, auto $1M, umbrella $1M-$5M) are subcontractor rules; their use for software vendors is [design].

#### E-commerce and DTC brands (Shopify ecosystem) (`ecommerce`)

Employees 1-50; models smb. Examples: skincare brand; supplement brand; pet-food label; Shopify Plus home-goods store; multi-brand store operator.

**Sourced**
- Shopify partners blog: merchants need email, SMS, reviews, fulfillment and returns apps; gives no merchant counts (https://www.shopify.com/partners/blog/opportunities-for-shopify-partners-in-2025, 2025)
- Built for Shopify requirements: storefront performance, Polaris, webhooks, privacy (https://shopify.dev/apps/launch/built-for-shopify/requirements, retrieved 2026-10-14)
- Optifai 2026 (N=939): 14-30 day cycles under $15k (https://prospeo.io/s/sales-cycle-example, secondary)

**[design] estimates stored in the data**
- ACV $300-$3k; qualified win rate 20%; annual churn 32%; buyer is the user 60% of the time.
- Cycle days: <$5k 1-14; $5-25k 14-45; $25-100k 45-120; >$100k 120-270.
- Committee at typical ACV: about 3.3 roles and 2.6 non-user people. Roles that can block: agency (0.6), technical (0.4).
- Procurement: card limit $5k; quotes from none; RFP from none; board approval 0% above none; fiscal year starts month 1; budgets set in months 8, 9, 10; payment card or prepaid.
- Paperwork (probability, from ACV): w9 10% (>= $5k), dpa 30% (>= $5k), security_questionnaire 20% (>= $5k).
- Method: **Value selling**, critical elements pain, metrics. Self-serve trial that proves value in the first session; simple ROI. BANT-lite is enough at this ACV; MEDDPICC only for agencies and Plus brands.
- Most likely scenarios: Peak-season freeze (Oct-Dec) (50%); Bottom-up install then uninstall after the trial (40%); Buyer is an agency, not the merchant (35%).
- Seasonality: busy months 1, 2, 3, 8, 9, slow 11, 12. Merchants freeze before Black Friday-Cyber Monday; monthly churn of 3-6% is common for small merchants [design].
- Solo-founder fit: **0.8**.

**Choices and flags.** Shopify publishes no merchant counts in the partner blog; no independent Shopify merchant-decision data exists. Win rate 20% is the generic trial-to-paid range (15-25%, secondary), not Shopify-specific. Payment rides on the Shopify invoice, so card limit 5,000 is a placeholder with no real function.

#### Startups and tech SMBs (10-100 employees, PLG and self-serve) (`startup_smb`)

Employees 1-100; models smb. Examples: Series A dev-tools company; 40-person fintech; remote-first agency; B2B marketplace with a 30-person ops team.

**Sourced**
- ChartMogul 2025 via aggregator: SMB (1-50 employees) annual logo churn 11-13% (https://stealthagents.com/research/saas-churn-rate-statistics-2026, secondary); another gives 10-14% (https://userjot.com/blog/saas-churn-rate-benchmarks)
- Ramp example policy: auto-approve under $1,000, manager $1k-$5k, director over $5k (https://ramp.com/answers/policy-enforcement/policy-rules-interact-with-spend-limits, undated; configuration example, not a survey)
- Ebsta/Pavilion 2025 via Webtonic: 91 days average new business, 52 days expansion (https://www.webtonic.io/blog/average-sales-cycle-length-by-industry, secondary)

**[design] estimates stored in the data**
- ACV $3k-$30k; qualified win rate 25%; annual churn 15%; buyer is the user 65% of the time.
- Cycle days: <$5k 1-14; $5-25k 14-45; $25-100k 45-90; >$100k 90-150.
- Committee at typical ACV: about 3.3 roles and 2.3 non-user people. Roles that can block: champion (0.6), security (0.5), legal (0.2).
- Procurement: card limit $5k; quotes from $25k; RFP from none; board approval 5% above $100k; fiscal year starts month 1; budgets set in months 11, 12, 1; payment net-30.
- Paperwork (probability, from ACV): w9 50% (>= $5k), coi_insurance 30% (>= $25k), soc2_type1 20% (>= $25k), soc2_type2 30% (>= $50k), soc2_bridge_letter 25% (>= $25k), security_questionnaire 50% (>= $25k), caiq 20% (>= $25k), dpa 50% (>= $25k), msa_redlines 30% (>= $25k).
- Method: **MEDDPICC**, critical elements champion, pain, decisionProcess, paperProcess. PQL first, then a short value conversation; MEDDPICC-lite from $5k, adding the paper process once security or a DPA appears. No named champion means unqualified.
- Most likely scenarios: Security questionnaire arrives at $25k (50%); Free tier team wants a paid upgrade (40%); Corporate card blocked by a per-transaction limit (20%).
- Seasonality: busy months 1, 2, 9, 10, slow 7, 8, 12. Budget reset in Jan-Feb; Q4 budgets Sep-Oct. Monthly contracts churn 3-5x faster than annual (Recurly 2025, secondhand, unverified).
- Solo-founder fit: **0.7**.

**Choices and flags.** ChartMogul-via-aggregator churn is 10-14% for 1-50 employees (secondary, unverified); chose 15% because the segment includes monthly-plan tools and 10-100 employee companies. A figure that about a third of organisations lose a deal over a missing certification (Vanta via DEV) is [unverified] and only informs the SOC 2 probabilities. Starr's 84-day median for >$100k has inconsistent attribution.

#### Mid-market companies (100-1,000 employees) (`mid_market`)

Employees 100-1000; models smb + ent. Examples: regional distributor; multi-clinic healthcare group; franchise operator; professional-services firm; mid-size manufacturer.

**Sourced**
- Mid-market buying groups average about 6-7 stakeholders (Influ2 2026, cited by https://komo.ai/glossary/mid-market-sales, unverified)
- Starr Conspiracy: 84-day median for >$100k, 42 days for $10k-$100k, 21 days under $10k (attribution unclear; https://www.thestarrconspiracy.com/insights/benchmarks/b2b-go-to-market-strategy-benchmarks-2025, 2025)
- Techaisle: IT controls about half of IT budget decisions in 100-999 employee firms (2021 survey; https://www.techaisle.com/blog/324-smb-and-midmarket-itdms-and-bdms-the-balance-of-purchase-authority)
- ChartMogul 2025 via aggregator: mid-market annual logo churn 6-8% (https://stealthagents.com/research/saas-churn-rate-statistics-2026, secondary)

**[design] estimates stored in the data**
- ACV $10k-$60k; qualified win rate 20%; annual churn 8%; buyer is the user 45% of the time.
- Cycle days: <$5k 7-21; $5-25k 30-75; $25-100k 60-120; >$100k 120-240.
- Committee at typical ACV: about 5.5 roles and 6.0 non-user people. Roles that can block: board (0.7), technical (0.65), champion (0.6), procurement (0.6).
- Procurement: card limit $5k; quotes from $15k; RFP from $150k; board approval 8% above $250k; fiscal year starts month 1; budgets set in months 10, 11, 12; payment net-30, PO required.
- Paperwork (probability, from ACV): w9 90%, coi_insurance 60% (>= $25k), vendor_portal 30% (>= $25k), soc2_type2 55% (>= $25k), sig_lite 40% (>= $25k), caiq 20% (>= $25k), dpa 50% (>= $25k), vpat 10% (>= $25k), msa_redlines 50% (>= $25k), rfp_response 25% (>= $100k).
- Method: **MEDDPICC**, critical elements economicBuyer, decisionProcess, paperProcess, champion. Several stakeholders, a real paper process and a champion who needs coaching; mutual action plan with dates. Challenger for the first meeting with the economic buyer.
- Most likely scenarios: Department head loves it, finance says no (55%); Team pilot to convert to a company licence (25%); Hidden IT veto (20%).
- Seasonality: busy months 10, 11, 1, 2, slow 7, 8, 12. Budget planning Oct-Dec; mid-year budget changes in Jul-Aug. Start renewal conversations 90-120 days out.
- Solo-founder fit: **0.45**.

**Choices and flags.** Influ2 2026 (6-7 stakeholders) is cited only through a glossary and is [unverified]; Starr gives 6.8 (attribution unclear). The 6.2-month cycle (sci-tech-today) has no year or median and is not used. Procurify 2026 measures requisition-to-PO time, not sales cycles. Techaisle (2021) is dated.

#### Fortune 500 and large enterprise (`enterprise`)

Employees 1000-500000; models ent. Examples: national bank; regional insurer; pharma company; US telecom; global manufacturer.

**Sourced**
- Gartner 2024 abstract: a traditional RFP process can take more than six months to evaluate, select and contract a supplier (https://www.gartner.com/en/documents/6063463)
- Ebsta/Pavilion 2024 via Starr Conspiracy: a single $250k+ deal took 192 days from first touch to closed-won (https://www.thestarrconspiracy.com/insights/benchmarks/b2b-go-to-market-strategy-benchmarks-2025, secondhand)
- Questionnaire sizes: SIG Core ~850 (older) / 627 (2025), SIG Lite ~126-200, CAIQ ~260-300; a full questionnaire takes 20-40 vendor hours (https://rocketdocs.com/resources/blog/vendor-security-questionnaire, retrieved 2026-10-14, vendor)
- First enterprise deal about six weeks of legal back-and-forth; later order forms under an MSA 2-3 days (https://resources.rework.com/libraries/deal-closing/msa-development, anecdote)

**[design] estimates stored in the data**
- ACV $25k-$250k; qualified win rate 15%; annual churn 4%; buyer is the user 10% of the time.
- Cycle days: <$5k 14-45; $5-25k 60-120; $25-100k 120-180; >$100k 180-300.
- Committee at typical ACV: about 7.8 roles and 10.1 non-user people. Roles that can block: security (0.9), procurement (0.8), legal (0.8), champion (0.7).
- Procurement: card limit $5k; quotes from $100k; RFP from $150k; board approval 20% above $500k; fiscal year starts month 1; budgets set in months 9, 10, 11; payment net-60, PO required.
- Paperwork (probability, from ACV): w9 100%, vendor_portal 90%, coi_insurance 95%, sig_lite 50%, sig_core 40% (>= $50k), caiq 30%, soc2_type2 90%, pen_test 70%, iso27001 20%, dpa 80%, bcp_dr_summary 50%, vpat 20%, msa_redlines 95%, rfp_response 30% (>= $100k).
- Method: **MEDDPICC**, critical elements paperProcess, decisionProcess, economicBuyer, champion. The only method that fits the number of gates. Mutual action plan including the security review, legal redlines, procurement onboarding and the budget date.
- Most likely scenarios: Legal redline stalls on liability or indemnity (50%); TPRM rejects SOC 2 Type I only (30%); Procurement forces an RFP (30%).
- Seasonality: busy months 9, 10, 11, 1, slow 8, 12. Q4 use-it-or-lose-it pushes in some companies; renewals are a re-procurement event; give 90-120 days notice on auto-renew.
- Solo-founder fit: **0.12**.

**Choices and flags.** Committee-size evidence conflicts (Gartner 5-16 primary, Forrester 13 + 9 secondary, Starr 11.2); the model uses the Gartner range with Starr scaling and treats Forrester as an upper bound including advisors. Vanta 2025 (78% of companies delayed by security reviews; nine working weeks a year) could not be retrieved and is [unverified]. Insurance minimums ($1M-$5M GL, $5M-$10M cyber) are [design].

#### Hotels and hospitality groups (`hotels`)

Employees 5-1000; models smb + ent. Examples: 60-room independent hotel; owner-operated inn; hotel management company with 40 properties.

**Sourced**
- Hotel Interactive May 2026 panel on hotel procurement (Crescent Hotels & Resorts, Hilton Supply Management, Westmont Hospitality) (https://hotelinteractive.com/?p=35134, 2026-05)
- SaaSHero: Q4 is budget planning season and multi-stakeholder approvals are slowing in 2026 (https://www.saashero.net/uncategorized/hotel-tech-lead-gen-strategies/, 2026-06-23, marketing-informed)
- Protel opinion: sourcing, buying and deploying takes "many months" even with management backing (https://www.hotel-yearbook.com/article/4092737.html)

**[design] estimates stored in the data**
- ACV $3k-$25k; qualified win rate 22%; annual churn 18%; buyer is the user 40% of the time.
- Cycle days: <$5k 14-42; $5-25k 30-90; $25-100k 90-180; >$100k 180-365.
- Committee at typical ACV: about 3.7 roles and 2.8 non-user people. Roles that can block: champion (0.7), group ops (0.7), procurement (0.6), technical (0.6).
- Procurement: card limit $3.5k; quotes from $15k; RFP from $75k; board approval 10% above $100k; fiscal year starts month 1; budgets set in months 10, 11, 12; payment net-30.
- Paperwork (probability, from ACV): w9 70%, coi_insurance 50%, pci_attestation 50%, franchisor_vendor_approval 25% (>= $5k), security_questionnaire 30% (>= $25k), dpa 35% (>= $25k), soc2_type2 35% (>= $50k).
- Method: **Value selling**, critical elements pain, economicBuyer, champion. GM buys on operational pain (labour hours, complaints); group buys on standardisation and data. Short ROI based on labour saved per property; light MEDDIC for groups.
- Most likely scenarios: Buyer is the owner or asset manager, not the GM (40%); Management company wants a 3-property pilot (30%); GM leaves or property changes hands (25%).
- Seasonality: busy months 10, 11, 1, slow 7, 8, 12. Q4 budget planning; avoid peak occupancy. Churn spikes when a property changes management or brand.
- Solo-founder fit: **0.6**.

**Choices and flags.** No hotel-specific cycle benchmark exists; the Bridge Group Q4 2025 figures (median ACV $32K, 91 days) were only on a secondary page and are not used. Hotel Interactive and Hotel Tech Report pages are context; the latter is flagged boilerplate with low evidentiary value.

#### Franchise systems (franchisors and franchisees) (`franchise_systems`)

Employees 1-500; models smb + ent. Examples: QSR brand with 2,000 franchised units; fitness franchise; home-services franchise; 12-unit franchisee.

**Sourced**
- McDonald's agreed to cut US technology fees by 62% after a third-party billing review (https://thespoon.tech/following-tensions-mcdonalds-cuts-tech-fees-for-franchisees-by-62-percent/, undated)
- FRANdata: 75% of franchisors expected to raise technology and innovation capital spending in 2025 (https://frandata.com/franchisors_are_doubling_down_on_technology, 2025-03)
- Software mandates (POS, CRM, booking) are routine if disclosed in the FDD (https://cfa.ca/start-me-up-considerations-for-franchisors-when-mandating-the-use-of-software-by-franchisees/, 2025-03); scope varies by state

**[design] estimates stored in the data**
- ACV $1k-$50k; qualified win rate 20%; annual churn 12%; buyer is the user 30% of the time.
- Cycle days: <$5k 7-28; $5-25k 30-90; $25-100k 90-180; >$100k 180-365.
- Committee at typical ACV: about 2.4 roles and 1.8 non-user people. Roles that can block: technical (0.8), champion (0.7), procurement (0.6), legal (0.6).
- Procurement: card limit $5k; quotes from $15k; RFP from $100k; board approval 15% above $250k; fiscal year starts month 1; budgets set in months 9, 10, 11; payment net-30.
- Paperwork (probability, from ACV): w9 90%, coi_insurance 80%, franchisor_vendor_approval 50% (>= $5k), pci_attestation 50%, security_questionnaire 60% (>= $25k), dpa 70% (>= $25k), msa_redlines 60% (>= $25k), soc2_type2 40% (>= $50k).
- Method: **MEDDPICC**, critical elements paperProcess, decisionProcess, champion, economicBuyer. Two motions: MEDDPICC with an approved-supplier focus for the franchisor (long and paper-heavy); value selling with a per-unit ROI and a 30-day pilot for franchisees.
- Most likely scenarios: The deal is really with the franchisor (70%); Franchisee wants you but the franchisor mandates another vendor (30%); Franchisor approves a single supplier and you lose (20%).
- Seasonality: busy months 9, 10, 11, 1, slow 12. Franchisor budgets Q3-Q4; franchisee budgets January.
- Solo-founder fit: **0.3**.

**Choices and flags.** The Princeton Review 1995 discount cap (lesser of $50 or 15%) is dated and only illustrates structure. McDonald's 62% tech-fee cut is reported secondhand (Bloomberg via The Spoon). Approved-vendor mechanics are from franchise-law blogs; the scope of software mandates varies by state.

### Group: health

#### Independent dental, medical and veterinary practices (and DSO sites) (`health_practices`)

Employees 2-200; models smb. Examples: solo general dentist; 3-vet small-animal clinic; 2-physician family medicine group; 20-location DSO with central purchasing.

**Sourced**
- ADA HPI: 72.5% of US dentists were practice owners in 2023 (84.7% in 2005); DSO affiliation 16% in 2024 vs 7.2% in 2015 (https://www.ada.org/resources/research/health-policy-institute/dental-practice-research)
- JAVMA via Biltmore Beacon: corporate groups held about half of US domestic vet revenue by 2023 (https://www.biltmorebeacon.com/news/private-equity-is-reshaping-asheville-s-vet-clinics-they-re-circling-me-like-a-vulture/article_b3429631-57fe-45dc-a65b-747d665cc547.html, 2025)
- Chicago Midwinter drew 21,000+ attendees in 2024 (https://www.cds.org/2026-midwinter-meeting/)
- HIPAA Security Rule update still a proposal; comment period closed 2025-03-07 (vendor article, https://konfirmity.com/blog/hipaa-what-changed-in-2026, 2026-07, unverified)

**[design] estimates stored in the data**
- ACV $1.5k-$12k; qualified win rate 25%; annual churn 20%; buyer is the user 35% of the time.
- Cycle days: <$5k 1-14; $5-25k 14-45; $25-100k 60-150; >$100k 120-270.
- Committee at typical ACV: about 3.4 roles and 2.6 non-user people. Roles that can block: dso hq (0.9), champion (0.7), technical (0.4), owner spouse (0.3).
- Procurement: card limit $5k; quotes from $15k; RFP from none; board approval 10% above $50k; fiscal year starts month 1; budgets set in months 10, 11, 12; payment net-15.
- Paperwork (probability, from ACV): w9 80%, hipaa_baa 60%, coi_insurance 30% (>= $25k), security_questionnaire 50% (>= $25k), dpa 20% (>= $25k).
- Method: **Value selling**, critical elements metrics, champion, economicBuyer. Lead with the owner's money and time (no-shows, staff hours, collections); pilot with one hygienist. MEDDICC with a 2-3 site, 60-day pilot for DSOs.
- Most likely scenarios: Office manager loves it, owner won't sign (35%); Two-week trial then silence (30%); DSO pilot approved, HQ stalls on procurement (20%).
- Seasonality: busy months 1, 2, 3, 10, slow 7, 8, 12. Q4 is the best time to sell annual plans; holidays and summer vacations are slow. Churn spikes at practice sale or retirement.
- Solo-founder fit: **0.65**.

**Choices and flags.** Dentaleconomics (2003) is the only source for "the office manager runs the evaluation", so it is [design]-grade. The HIPAA Security Rule update is still an NPRM (comment period closed 2025-03-07; target July 2027 per a vendor article, [unverified]). Vet practices are outside HIPAA, so the BAA probability is 0.6 rather than ~1. Solo fit: 0.7 for independents and 0.3 for DSOs in the note; 0.65 here because independents dominate the committee model.

#### Hospitals and health systems (`hospitals`)

Employees 100-100000; models ent. Examples: 150-bed community hospital on Epic; 12-hospital regional system; academic medical center; 25-bed critical access hospital.

**Sourced**
- L.E.K. 2025 survey: about half of health-system executives report constrained or high-risk finances; over half hold under 180 days cash (https://www.lek.com/insights/medtech/state-medtech-customer-base-insights-leks-2025-us-health-system-executive-survey, 2025)
- Health-system sales cycles 3-18 months (Rock Health roundup, https://rockhealth.com/top-quotes-lessons-digital-health-ceo/); 18-24 months from an executive interview [unverified]
- Epic Showroom listing takes 8-16 weeks; each hospital still runs its own review (https://nirmitee.io/blog/epic-vendor-security-review/, undated, blog)
- Premier acquired by Patient Square Capital, Sept 2025 [unverified, search summary]

**[design] estimates stored in the data**
- ACV $20k-$100k; qualified win rate 20%; annual churn 10%; buyer is the user 10% of the time.
- Cycle days: <$5k 30-90; $5-25k 90-180; $25-100k 180-365; >$100k 365-730.
- Committee at typical ACV: about 7.8 roles and 15.1 non-user people. Roles that can block: clinical (0.9), champion (0.8), security (0.8), privacy (0.7).
- Procurement: card limit $2.5k; quotes from $25k; RFP from $100k; board approval 50% above $100k; fiscal year starts month 7; budgets set in months 3, 4, 5; payment net-45, PO required; cooperative contracts: Vizient, Premier.
- Paperwork (probability, from ACV): w9 100%, vendor_portal 80%, hipaa_baa 95%, coi_insurance 90%, security_questionnaire 85%, sig_lite 50%, soc2_type2 85% (>= $25k), pen_test 60% (>= $25k), dpa 50%, bcp_dr_summary 60%, epic_vendor_review 50% (>= $25k), msa_redlines 80% (>= $25k), rfp_response 25% (>= $100k).
- Method: **MEDDPICC**, critical elements champion, decisionProcess, economicBuyer, paperProcess. Map the VAC calendar on day one (a missed meeting costs 4-6 weeks), the security gate and the Epic analyst. Value selling for the CFO: payback under 12 months, written pilot success criteria.
- Most likely scenarios: Security questionnaire stalls (40%); VAC meets only quarterly (25%); Champion leaves the hospital (20%).
- Seasonality: busy months 3, 4, 5, 9, 10, slow 7, 12, 1. July 1 fiscal-year freeze (design); capital planning early in the calendar year; late Nov to early Jan is dead.
- Solo-founder fit: **0.25**.

**Choices and flags.** Cycle claims conflict: 3-18 months (Rock Health roundup), 18-24 months (an executive interview, [unverified]) and "some deals three years" ([unverified]). Chose >$100k at 12-24 months, $25-100k at 6-12 months. July 1 fiscal year is [design] (no source). Premier's Sept 2025 acquisition by Patient Square Capital is [unverified]. Epic timelines range from 8-16 weeks (Showroom listing) to 3-18 months (bidirectional integration); 8-16 weeks is used for the listing review only.

#### Pharma, biotech and life-sciences companies (GxP) (`pharma`)

Employees 20-100000; models ent. Examples: 60-person clinical-stage biotech using a CRO; CDMO with 3 GMP sites; mid-size generics maker; top-20 pharma R&D quality group.

**Sourced**
- Agency page: 120-365 days and $60k-$800k ACV for pharma (https://www.devcommx.com/ai-sdr/durham/pharma, undated, vendor, unverified)
- Biopharma SaaS model: 6-18 months (https://businessmodels.compound.vc/model/saas-for-biopharma, undated)
- Supplier qualification must finish before purchase (https://intuitionlabs.ai/articles/gxp-saas-release-validation-index, undated, unverified)
- FDA CSA guidance issue date unconfirmed (secondary says 2026-02-03); verify on fda.gov

**[design] estimates stored in the data**
- ACV $15k-$80k; qualified win rate 20%; annual churn 8%; buyer is the user 10% of the time.
- Cycle days: <$5k 14-42; $5-25k 60-120; $25-100k 180-270; >$100k 270-540.
- Committee at typical ACV: about 7.0 roles and 8.6 non-user people. Roles that can block: champion (0.8), quality (0.8), supplier quality (0.8), security (0.7).
- Procurement: card limit $2.5k; quotes from $25k; RFP from $250k; board approval 30% above $100k; fiscal year starts month 1; budgets set in months 9, 10, 11, 12; payment net-45, PO required.
- Paperwork (probability, from ACV): w9 100%, vendor_portal 60%, coi_insurance 90%, security_questionnaire 90%, supplier_audit 80% (>= $5k), quality_agreement 80% (>= $25k), csv_validation_package 80% (>= $5k), soc2_type2 85% (>= $25k), pen_test 50% (>= $25k), dpa 50%, msa_redlines 70% (>= $25k).
- Method: **MEDDPICC**, critical elements paperProcess, decisionCriteria, champion, economicBuyer. The supplier-qualification process is the paper process. Lead with the validation package and audit readiness; Challenger for quality leaders who have seen a bad inspection.
- Most likely scenarios: Supplier audit scheduled for month 4 (40%); CSV lead rejects on evidence grounds (35%); Champion moves to another company (20%).
- Seasonality: busy months 1, 2, 3, 7, 9, slow 8, 12. Audit planning and budgets in Q1 and Q3; switching costs revalidation, so churn is low once live.
- Solo-founder fit: **0.2**.

**Choices and flags.** Cycle claims: 120-365 days and $60k-$800k ACV (agency, [unverified]), 6-18 months (Compound VC), 18-24 months (unverified transcript). The ACV range is the notes' [design] $15k-$80k for a small vendor, not the agency's $60k-$800k, which describes large vendors. FDA CSA guidance issue date is unconfirmed (a secondary source says 2026-02-03); verify before citing.

### Group: professional

#### Law firms (solo and small through AmLaw 200) (`law_firms`)

Employees 1-5000; models smb + ent. Examples: solo personal-injury practice on Clio; 12-lawyer estate boutique; AmLaw 200 corporate firm buying KM or contract AI.

**Sourced**
- Clio 2025: 8% of solos and 4% of small firms use AI widely (https://www.clio.com/about/press/legal-trends-solo-small-law-firms-2025/, 2025)
- Smokeball 2025: 53% of small firms integrating gen AI vs 27% in 2023 (https://www.lawnext.com/2025/03/ai-adoption-nearly-doubles-among-small-law-firms-according-to-smokeballs-2025-state-of-law-report.html, 2025-03); conflicts with Clio on method
- ABA 2023 TechReport via PreVeil: 22% of firms asked by a client to complete a security questionnaire; 59% at firms of 50-99 lawyers (https://www.preveil.com/blog/law-firm-security-obligations-regulated-clients/, undated)
- ABA 2024 budgeting report: 41% of solos and 55% of 2-9 lawyer firms budget for technology (https://www.americanbar.org/groups/law_practice/resources/tech-report/2024/2024-budgeting-and-planning-techreport, ~2025-03, snippet only)

**[design] estimates stored in the data**
- ACV $1.5k-$30k; qualified win rate 20%; annual churn 18%; buyer is the user 85% of the time.
- Cycle days: <$5k 7-30; $5-25k 30-75; $25-100k 60-150; >$100k 90-270.
- Committee at typical ACV: about 2.4 roles and 2.2 non-user people. Roles that can block: finance (0.8), technical (0.7), security (0.7), champion (0.6).
- Procurement: card limit $5k; quotes from $25k; RFP from $75k; board approval 15% above $50k; fiscal year starts month 1; budgets set in months 9, 10, 11, 12; payment net-30.
- Paperwork (probability, from ACV): w9 80%, coi_insurance 50% (>= $25k), security_questionnaire 50% (>= $25k), sig_lite 40% (>= $25k), soc2_type2 70% (>= $50k), dpa 30% (>= $25k).
- Method: **Value selling**, critical elements economicBuyer, paperProcess, champion, pain. Value selling with a BANT-lite single call and a trial for solo and small firms; full MEDDPICC for AmLaw (champion in KM, COO/CFO buyer, security as decision criteria).
- Most likely scenarios: Security questionnaire arrives after a verbal yes (50%); Solo asks for a bar-association referral discount (40%); Solo has 3 years of Clio data (30%).
- Seasonality: busy months 1, 2, 3, 10, 11, slow 8, 12. Estate firms are busy Jan-Mar; AmLaw budgets in Q4/January; August and late December are dead. AmLaw churn happens at the procurement re-bid.
- Solo-founder fit: **0.65**.

**Choices and flags.** Clio (8% of solos / 4% of small firms use AI widely) and Smokeball (53% of small firms integrating gen AI vs 27% in 2023) conflict on method; both are stated, neither drives a number. The ABA 2024 figure of 41% of solos with a tech budget conflicts with a snippet saying 55.4% have none; the 41% is kept with caution. The segment ACV range is the solo/small band ($1.5k-$30k); AmLaw deals appear through minAcv roles and the >$100k cycle. No AmLaw outside-counsel guidelines were found, so AmLaw procurement is [design]. Solo fit 0.7 small, 0.1 AmLaw in the note; 0.65 here.

#### Accounting and CPA firms (`accounting_firms`)

Employees 1-1500; models smb + ent. Examples: 3-person tax and bookkeeping practice; 40-person regional firm on CCH Axcess; PE-backed roll-up platform.

**Sourced**
- CPA Trendlines deal tracker: 525 events and $49B transacted EV in PE consolidation (https://cpatrendlines.com/2025/11/23/pe-ma-will-consolidate-accounting-profession, 2025-11-23)
- Intuit (vendor): best time to onboard is extension season May-October (https://accountants.intuit.com/taxprocenter/practice-management/workflow-tools/upgrading-software-in-the-fall-smart-firms-dont-wait/, undated)
- Thomson Reuters (vendor): Q3 is the best time to purchase tax software (https://tax.thomsonreuters.com/blog/why-q3-is-the-best-time-for-firms-to-purchase-tax-software/, undated)
- FTC Safeguards Rule (16 CFR 314) covers tax preparers; secondary summaries conflict on small-firm exceptions

**[design] estimates stored in the data**
- ACV $2k-$15k; qualified win rate 20%; annual churn 12%; buyer is the user 80% of the time.
- Cycle days: <$5k 14-30; $5-25k 30-60; $25-100k 60-120; >$100k 90-240.
- Committee at typical ACV: about 2.9 roles and 2.1 non-user people. Roles that can block: champion (0.7), board (0.7), security (0.6), partner committee (0.6).
- Procurement: card limit $5k; quotes from $25k; RFP from none; board approval 10% above $25k; fiscal year starts month 1; budgets set in months 9, 10, 11; payment net-30.
- Paperwork (probability, from ACV): w9 80%, coi_insurance 40% (>= $15k), ftc_safeguards_wisp 60% (>= $5k), dpa 40% (>= $15k), security_questionnaire 40% (>= $25k), soc2_type2 40% (>= $40k).
- Method: **Value selling**, critical elements pain, champion, paperProcess. Sell in Q3 for go-live before January; live demo on their own client data (with consent). MEDDPICC for mid-size firms with a security review.
- Most likely scenarios: Buyer wants to start in January (50%); IT provider or cyber insurer stalls the deal (40%); Staff revolt on peak-season migration (30%).
- Seasonality: busy months 6, 7, 8, 9, slow 1, 2, 3, 4. Busy season January-April (peak); extension season May-October is the buying window. Intuit and Thomson Reuters (vendors) both recommend fall/Q3 onboarding.
- Solo-founder fit: **0.45**.

**Choices and flags.** Almost all timing evidence is vendor-authored (Intuit, Thomson Reuters). The FTC Safeguards small-firm exception is described differently across summaries; cite 16 CFR 314 directly. CPA Trendlines and IFAC PE figures are context, not inputs. Solo fit 0.5 small firm, 0.2 mid-size in the note; 0.45 here.

#### Real estate agents and brokerages (`real_estate`)

Employees 1-1000; models smb. Examples: solo agent; 15-agent independent brokerage; 300-agent regional brokerage; national brand franchise.

**Sourced**
- NAR 2025 Profile: 88% of buyers used an agent, 91% of sellers, 5% FSBO (https://www.nar.realtor/press-releases/first-time-home-buyer-share-falls-to-historic-low-of-21-median-age-rises-to-40, 2025-11-04)
- NAR tech survey: 34% of agents spend $50-250/month on tools; 24% spend over $500; barriers: learning curve 63%, cost 59%; 96% use MLS, 79% e-signature, 46% a CRM (https://www.nar.realtor/newsroom/realtors-embrace-ai-digital-tools-to-enhance-client-service-nar-survey-finds, 2025-09; report year conflicts between sources)
- TotalBrokerage (vendor): brokers calling tech "a checkbox" rose from 16.3% (2023) to about 30% (2024) (https://www.totalbrokerage.com/blog/state-of-brokerage-technology-2023-survey-results)

**[design] estimates stored in the data**
- ACV $600-$30k; qualified win rate 18%; annual churn 35%; buyer is the user 60% of the time.
- Cycle days: <$5k 1-14; $5-25k 30-75; $25-100k 60-150; >$100k 180-365.
- Committee at typical ACV: about 2.1 roles and 2.1 non-user people. Roles that can block: franchisor (0.7), champion (0.6), legal (0.5), technical (0.4).
- Procurement: card limit $3k; quotes from none; RFP from none; board approval 0% above none; fiscal year starts month 1; budgets set in months 11, 12; payment net-30.
- Paperwork (probability, from ACV): w9 40% (>= $6k), coi_insurance 30% (>= $6k), mls_data_use_review 30% (>= $6k), security_questionnaire 40% (>= $25k), dpa 30% (>= $25k).
- Method: **Value selling**, critical elements economicBuyer, champion, metrics, paperProcess. Value selling with SPIN discovery for agents (time saved per transaction); Challenger for the broker who thinks tech is a checkbox; MEDDIC for 100+ agent offices.
- Most likely scenarios: Broker buys, agents refuse to adopt (50%); Agent wants a personal tool inside a brokerage that has one (40%); MLS data-use approval (30%).
- Seasonality: busy months 11, 12, 1, 2, slow 3, 4, 5, 6. Spring selling season is slow for vendors; brokers prefer to switch in Q4 or January. Agent churn is 30-50% [design].
- Solo-founder fit: **0.5**.

**Choices and flags.** The NAR technology report year conflicts (2025 per URL, 2026 per one summary); the URL date wins. TotalBrokerage percentages are from a vendor with a commercial interest. Broker-level numbers are [design]. Spring (Mar-Jun) is the *worst* time to pitch brokerages even though it is their busiest sales season.

#### Marketing and creative agencies (`agencies`)

Employees 1-200; models smb. Examples: 6-person Shopify growth agency; 20-person B2B content and paid agency; 80-person full-service agency.

**Sourced**
- ANA/4As: average client-agency relationship about 7 years (vs 3.2 in 2016) (https://www.ana.net/content/show/id/pr-2025-04-tenure, 2025-04)
- GetApp 2025 (1,116 marketing decision-makers): 79% plan to raise software spend by 5%+; top buying difficulties: picking a tool and security, 37% each (https://www.businesswire.com/news/home/20250218836718/en, 2025-02-18; marketing teams, not agency owners)
- Focus Digital (vendor): annual client churn 33% performance-based, 28% hybrid, 18% retainer (https://focus-digital.co/?p=6135, 2025)

**[design] estimates stored in the data**
- ACV $600-$30k; qualified win rate 20%; annual churn 30%; buyer is the user 60% of the time.
- Cycle days: <$5k 7-30; $5-25k 14-45; $25-100k 60-90; >$100k 90-180.
- Committee at typical ACV: about 2.8 roles and 3.1 non-user people. Roles that can block: champion (0.6), client (0.6), security (0.5), finance (0.4).
- Procurement: card limit $5k; quotes from none; RFP from none; board approval 0% above none; fiscal year starts month 1; budgets set in months 10, 11, 12; payment net-30.
- Paperwork (probability, from ACV): w9 15%, coi_insurance 25% (>= $6k), dpa 30% (>= $6k), security_questionnaire 30% (>= $12k), soc2_type2 20% (>= $25k).
- Method: **Value selling**, critical elements metrics, champion, paperProcess. Hours per client per month x billing rate. MEDDIC for 25-200 person agencies; client approval is the paper process when the tool touches client accounts.
- Most likely scenarios: Account managers refuse to adopt (40%); Client must approve a tool touching its ad accounts (30%); Budget cut as retainers shrink (30%).
- Seasonality: busy months 1, 2, 3, 10, 11, slow 7, 8. Q1 budgets and Q4 planning; retainer clients stay ~56 months vs 24 for project clients (Setup 2025 via Agiled) [secondary].
- Solo-founder fit: **0.65**.

**Choices and flags.** The GetApp 2025 and ANA data describe marketing teams and client-agency tenure, not agency owners' tool buying; they are context only. The 33% / 28% / 18% churn splits are the agency's own client churn (vendor Focus Digital) and are not used as tool churn; tool churn 30% is [design].

### Group: regulated

#### Banks, credit unions and financial services (`banks`)

Employees 5-100000; models smb + ent. Examples: $400M community bank with 60 staff; rural credit union with 15 staff; regional bank; small broker-dealer.

**Sourced**
- 4,238 FDIC-insured institutions reporting Q2 2026 (https://www.fdic.gov/news/press-releases/2026/fdic-insured-institutions-reported-return-assets-126-percent-and-net, 2026-08-25)
- 4,214 federally insured credit unions at 2026-06-30, down from 4,370 (https://ncua.gov/files/publications/analysis/quarterly-data-summary-2026-Q2.pdf, 2026)
- Interagency third-party risk guidance, OCC Bulletin 2023-17: due diligence scaled to risk and criticality (https://www.mofo.com/pdf/resources/insights/230620-banking-agencies-issue-joint-third-party, 2023-06)
- Procurement up to 18 months plus up to 18 months integration (Temenos via Chronicle.lu, vendor-cited, undated); RegTech to banks 8-18 months (https://www.saashero.net/strategy/marketing-regtech-to-banks/, 2026-08-06, consultancy)

**[design] estimates stored in the data**
- ACV $5k-$30k; qualified win rate 20%; annual churn 8%; buyer is the user 25% of the time.
- Cycle days: <$5k 14-45; $5-25k 45-120; $25-100k 90-240; >$100k 180-540.
- Committee at typical ACV: about 5.6 roles and 5.0 non-user people. Roles that can block: security (0.7), technical (0.6), core provider (0.6), compliance (0.5).
- Procurement: card limit $5k; quotes from $25k; RFP from $100k; board approval 30% above $100k; fiscal year starts month 1; budgets set in months 10, 11, 12; payment net-30.
- Paperwork (probability, from ACV): w9 100%, coi_insurance 90%, vendor_portal 30%, security_questionnaire 50% (>= $5k), sig_lite 70% (>= $5k), sig_core 30% (>= $100k), soc2_type2 80% (>= $25k), pen_test 50% (>= $25k), dpa 80%, bcp_dr_summary 70% (>= $5k), msa_redlines 60% (>= $25k), rfp_response 30% (>= $100k).
- Method: **MEDDPICC**, critical elements paperProcess, economicBuyer, decisionCriteria, champion. Many roles, a vendor-risk paper process and exam-defensible evidence. BANT-lite under $5k; Challenger for an exam finding or manual-work cost insight.
- Most likely scenarios: Buyer is not the user (75%); Forced RFP at a regional or large bank (30%); Board approval needed (30%).
- Seasonality: busy months 10, 11, 12, 1, slow 7, 8. Avoid exam windows and quarter-end; bank M&A (54 mergers in Q1 2026) drives churn; renewals repeat vendor review every 1-3 years, start 120 days ahead.
- Solo-founder fit: **0.35**.

**Choices and flags.** Cycle sources conflict: Temenos (via Chronicle.lu/Euromoney) says procurement up to 18 months plus 18 months integration; Saas Hero says RegTech 8-18 months; the general SaaS median is ~91 days. Bands are [design] with >$100k at 6-18 months. A proposed revision of the interagency third-party guidance (comments due 2026-11-16) comes from one law-firm alert; verify before relying on it. SIG Lite is 126-128 questions in the 2025 version and SIG Core 627 (older sources say ~850).

#### Insurance agencies and carriers (`insurance`)

Employees 3-10000; models smb + ent. Examples: 9-person independent P&C agency; benefits brokerage; MGA; regional mutual carrier.

**Sourced**
- Future One 2026 Agency Universe Study: about 37,000 independent agencies (down from ~39,000), average headcount 9.9 (up from 8.2) (https://www.insurancejournal.com/news/national/2026/09/24/886639.htm, 2026-09-24)
- Forrester Wave AMS Q4 2025 names Zywave, Applied Systems, EZLynx Leaders (https://research.oz.spotlightar.com/reports/forrester-wave-insurance-agency-management-systems-q4-2025/market-definition)
- NAIC Insurance Data Security Model Law (2017) requires third-party oversight, breach notice and safeguards by contract; state adoption varies (https://www.daypitney.com/?p=11930)

**[design] estimates stored in the data**
- ACV $1.5k-$12k; qualified win rate 25%; annual churn 12%; buyer is the user 35% of the time.
- Cycle days: <$5k 7-30; $5-25k 30-90; $25-100k 60-180; >$100k 180-540.
- Committee at typical ACV: about 3.7 roles and 2.8 non-user people. Roles that can block: carrier (0.6), security (0.5), technical (0.4).
- Procurement: card limit $5k; quotes from none; RFP from none; board approval 0% above none; fiscal year starts month 1; budgets set in months 10, 11, 12; payment card or prepaid.
- Paperwork (probability, from ACV): w9 60%, coi_insurance 50%, dpa 50% (>= $5k), security_questionnaire 40% (>= $12k), sig_lite 50% (>= $25k), soc2_type2 60% (>= $25k).
- Method: **Value selling**, critical elements pain, economicBuyer, paperProcess. Quantify staff time on renewals and retention (Challenger angle); BANT is enough for small agency deals; MEDDPICC for carriers. Integration with the AMS or carrier is a decision criterion.
- Most likely scenarios: Stall during Oct-Jan renewals (40%); AMS vendor lock-in (35%); Principal buys, staff don't like it (30%).
- Seasonality: busy months 3, 4, 5, 6, 7, 8, slow 10, 11, 12, 1. The notes list Q4 and January as agencies' busiest workload, so sales windows are late February to summer. Agency M&A and AMS switches drive churn.
- Solo-founder fit: **0.6**.

**Choices and flags.** Agency-level data is thin; everything but headcount (Future One 2026) is [design]. The NAIC 2025 adoption status was not confirmed. The notes call Oct-Jan the agencies' busiest *workload*; the data therefore marks Oct-Jan as slow for selling (busy = buying windows Mar-Aug).

#### Manufacturing plants (`manufacturing`)

Employees 20-5000; models smb + ent. Examples: 50-500 person job shop; food and beverage plant; plastics maker; multi-plant mid-market manufacturer.

**Sourced**
- Manufacturing firms: 239,265 in 2022, about 98% under 500 employees (https://manufacturingleadgeneration.com/small-manufacturing-business-statistics/, 2026-03, secondary Census compilation)
- CDW 2025 manufacturing survey: IT makes the final decision for most OT technology (https://webobjects2.cdw.com/is/content/CDW/cdw/field-marketing/mkt80853-manufacturing-infographic.pdf, 2025); Connection e-book: IT holds 51% of purchase authority, operations 29% (undated)
- NIST SP 800-82 Rev. 3 expands OT scope to supply chain and cloud (https://www.nist.gov/node/1826641)

**[design] estimates stored in the data**
- ACV $8k-$40k; qualified win rate 20%; annual churn 13%; buyer is the user 20% of the time.
- Cycle days: <$5k 14-45; $5-25k 45-120; $25-100k 90-180; >$100k 180-365.
- Committee at typical ACV: about 5.1 roles and 5.1 non-user people. Roles that can block: technical (0.7), ot (0.7), security (0.6), procurement (0.6).
- Procurement: card limit $5k; quotes from $15k; RFP from $100k; board approval 10% above $250k; fiscal year starts month 1; budgets set in months 9, 10, 11, 12; payment net-45, PO required.
- Paperwork (probability, from ACV): w9 90%, coi_insurance 70%, vendor_portal 40% (>= $25k), security_questionnaire 60% (>= $25k), ot_security_questionnaire 50% (>= $25k), soc2_type2 50% (>= $25k), iso27001 15% (>= $50k), dpa 40% (>= $25k), msa_redlines 40% (>= $50k), rfp_response 20% (>= $100k).
- Method: **MEDDPICC**, critical elements pain, economicBuyer, decisionCriteria, paperProcess. Solution-selling discipline (diagnose before demo); challenge with the cost of unplanned downtime or scrap. MEDDPICC from $25k or multi-plant; value selling for single-plant deals.
- Most likely scenarios: Plant manager loves it, corporate IT says no (40%); Bottom-up adoption on the floor (30%); OT security blocks the cloud connection (25%).
- Seasonality: busy months 9, 10, 11, 1, slow 7, 12. Capex planning in Q3-Q4; summer shutdown weeks and year-end are slow. Plant closures and corporate consolidation drive churn.
- Solo-founder fit: **0.3**.

**Choices and flags.** Union rate for manufacturing was not retrieved (BLS release has utilities at 17.8% only); the 15% union presence is [design]. P-card limits are [design] and unverified. The CDW and Connection surveys (IT holds the OT decision; 51% vs 29%) are vendor-linked.

#### Utilities (electric, water, gas; co-ops and municipals) (`utilities`)

Employees 10-10000; models ent. Examples: rural electric co-op with 60 staff; city-run water utility; investor-owned regional utility.

**Sourced**
- EIA: 163.7 million ultimate electricity customers in 2024 (161.7 million in 2023) (https://www.eia.gov/electricity/annual/html/epa_02_01.html)
- BLS: utilities had the highest unionisation rate by industry in 2025 at 17.8% (https://www.bls.gov/news.release/archives/union2_02182026.htm, 2026-02-18)
- NERC draft CIP-013-4 posted 2026; ballot window ran to Oct 15 so the Oct 7 board date may have slipped (https://www.nerc.com/globalassets/standards/projects/2025-06/formal-posting-1/cip-013-4-standard-clean-final-04282026.pdf); verify with NERC
- Vendor blog: grid infrastructure software takes 6-18 months, compliance/analytics 3-9, SCADA/OT 12-36 (https://www.knowlee.ai/blog/ai-sdr-for-energy-utilities-2026, 2026, unverified marketing estimate)

**[design] estimates stored in the data**
- ACV $10k-$80k; qualified win rate 20%; annual churn 8%; buyer is the user 20% of the time.
- Cycle days: <$5k 30-60; $5-25k 60-150; $25-100k 120-270; >$100k 270-540.
- Committee at typical ACV: about 5.7 roles and 5.2 non-user people. Roles that can block: compliance (0.8), security (0.7), technical (0.6), procurement (0.6).
- Procurement: card limit $3.5k; quotes from $25k; RFP from $50k; board approval 40% above $100k; fiscal year starts month 7; budgets set in months 4, 5, 6; payment net-30, PO required; cooperative contracts: Sourcewell, NASPO ValuePoint.
- Paperwork (probability, from ACV): w9 100%, coi_insurance 90%, vendor_portal 60%, security_questionnaire 70% (>= $5k), soc2_type2 60% (>= $25k), cip013_supplier_review 30%, vpat 30% (>= $25k), dpa 60%, msa_redlines 60% (>= $25k), rfp_response 40% (>= $50k).
- Method: **MEDDPICC**, critical elements paperProcess, decisionCriteria, economicBuyer, decisionProcess. Extra weight on the paper process (RFP and PUC steps) and decision criteria (CIP compliance, reliability). Value selling for small co-ops: cost of manual work per member.
- Most likely scenarios: Public RFP required above a threshold (40%); CIP-013 supplier review triggered (30%); Incumbent S/4HANA or GIS migration takes the budget (25%).
- Seasonality: busy months 4, 5, 10, 11, slow 7, 8, 9, 12. Budget planning Q2-Q3, board approvals Q4; storm and hurricane season and year-end are slow. Renewals run 3-5 years.
- Solo-founder fit: **0.2**.

**Choices and flags.** Cycle figures come from a vendor marketing blog (knowlee) and are [unverified]; utility count was not found (roughly 3,000 EIA-861 filers is [design]). NERC CIP-013-4 status is draft/ballot as of Oct 2026 and the board date may have slipped. Rate-case treatment of software spend has no source.

### Group: public

#### City and county government (`local_gov`)

Employees 3-10000; models smb + ent. Examples: county records office; city parks and recreation department; public works department; police records unit; city clerk.

**Sourced**
- GovTech analysis of 97 large cities: 37 at a $50,000 no-bid threshold, 16 at $25,000, Colorado Springs highest at $200,000 (https://govtech.com/biz/data/finding-the-magic-line-below-which-cities-can-buy-stuff-easily.html, undated)
- Spokane P-card default $1,000 per transaction and $5,000 per month, ceiling $5,000 / $25,000 (https://static.spokanecity.org/documents/opendata/policies/2025/admin-5600-25-01.pdf, 2025); Martinsville VA $1,500 / $3,500; Los Altos CA $2,500
- Gunnison UT raised its no-bid limit from $500 to $5,000 in March 2026 (AI meeting summary, verify minutes: https://cpo.soar.com/articles/7701701/Gunnison/Sanpete-County/Utah/Council-raises-no-bid-procurement-ceiling-from-500-to-5000)

**[design] estimates stored in the data**
- ACV $3k-$30k; qualified win rate 28%; annual churn 10%; buyer is the user 35% of the time.
- Cycle days: <$5k 1-14; $5-25k 14-56; $25-100k 60-180; >$100k 180-540.
- Committee at typical ACV: about 4.5 roles and 4.6 non-user people. Roles that can block: board (0.9), champion (0.7), technical (0.6), procurement (0.6).
- Procurement: card limit $2k; quotes from $5k; RFP from $50k; board approval 50% above $50k; fiscal year starts month 7; budgets set in months 3, 4, 5, 6; payment net-30, PO required; cooperative contracts: Sourcewell, OMNIA Partners, NASPO ValuePoint, state contracts.
- Paperwork (probability, from ACV): w9 100%, coi_insurance 80%, vendor_portal 50% (>= $5k), security_questionnaire 50% (>= $25k), soc2_type2 30% (>= $50k), vpat 30% (>= $25k), dpa 50% (>= $5k), sole_source_justification 25% (>= $5k), rfp_response 40% (>= $50k), cjis_addendum 8% (>= $5k).
- Method: **Value selling**, critical elements decisionProcess, paperProcess, champion, metrics. Value selling plus MEDDIC-lite: quantify backlog hours, find the budget line and map the approval path (threshold, council agenda deadlines). BANT is too weak because "budget" is a line item and fiscal-year timing.
- Most likely scenarios: Dept head and user want it, city manager won't sign (65%); Hidden blocker in IT or security (30%); Forced RFP just above the formal threshold (25%).
- Seasonality: busy months 1, 2, 3, 4, slow 7, 12. Planning and council approvals Jan-Apr; renewals are a budget event and cancellation decisions happen 60-90 days before the fiscal year.
- Solo-founder fit: **0.5**.

**Choices and flags.** P-card limits (Spokane, Los Altos, Martinsville) and no-bid thresholds (97 large cities) are sourced; win rate (25-40% with budget and champion; <15% for an unannounced RFP) is [design], 0.28 used. The Gunnison UT $500-to-$5,000 change is an AI meeting summary; verify the minutes. Most small towns have no purchasing office, which is why procurement is a low-probability role.

#### State government agencies (`state_gov`)

Employees 1000-100000; models ent. Examples: state Department of Health; state DOT; state HR system; Medicaid case-management program.

**Sourced**
- North Carolina: GovRAMP required for the executive branch from 2026-04-01, full compliance 2027-04-01 (https://www.doa.nc.gov/pandc/understanding-govramp-agency-procurement-overview/download, secondary summary)
- Arizona: renewal contracts from 2026-07-01 carry GovRAMP or FedRAMP-aligned risk-assessment requirements (https://govramp.org/programs/arizona)
- NASPO ValuePoint is run by a lead state; other states join by participating addendum; no open enrolment (https://civiciq.com/blog/how-to-get-on-a-cooperative-purchasing-contract, secondary)
- Gartner public-sector cycle of about 22 months, secondhand and an upper bound only (https://pinerycapital.substack.com/p/not-on-the-panel-687)

**[design] estimates stored in the data**
- ACV $15k-$150k; qualified win rate 22%; annual churn 9%; buyer is the user 25% of the time.
- Cycle days: <$5k 7-28; $5-25k 30-90; $25-100k 90-270; >$100k 270-540.
- Committee at typical ACV: about 6.7 roles and 6.2 non-user people. Roles that can block: champion (0.7), security (0.7), technical (0.6), procurement (0.6).
- Procurement: card limit $5k; quotes from $25k; RFP from $50k; board approval 10% above $500k; fiscal year starts month 7; budgets set in months 1, 2, 3, 4, 5, 6; payment net-35, PO required; cooperative contracts: NASPO ValuePoint, Sourcewell, OMNIA Partners.
- Paperwork (probability, from ACV): w9 100%, coi_insurance 100%, vendor_portal 90%, vpat 80% (>= $25k), soc2_type2 70% (>= $25k), govramp 50% (>= $25k), tx_ramp 10% (>= $25k), security_questionnaire 80% (>= $25k), dpa 70%, sole_source_justification 10%, msa_redlines 50% (>= $50k), rfp_response 40% (>= $50k).
- Method: **MEDDPICC**, critical elements paperProcess, decisionProcess, champion, competition. Long, formal decision and paper processes with the economic buyer often a deputy director or budget office; competition includes an existing cooperative contract.
- Most likely scenarios: Forced RFP above the state threshold (40%); GovRAMP status missing when the state requires it (40%); A cooperative contract already covers the category (30%).
- Seasonality: busy months 1, 2, 3, 4, 5, 6, 8, 9, slow 7, 12. Legislative session sets budgets Jan-Jun; August-September is year-end spend in July-start states; missing an option-year notice can force a rebid.
- Solo-founder fit: **0.25**.

**Choices and flags.** RFP thresholds are set by statute and vary; no verified state table exists, so 25k-100k is [design] (50k used). Gartner's ~22-month public-sector cycle is secondhand (Substack) and treated as an upper bound only. State GovRAMP dates come from one state document (NC, secondary summary), the GovRAMP Arizona page and a vendor guide that is unverified for Utah and Nevada. Cooperative-contract admin fees are not verified.

#### Federal government (civilian and defense) (`federal`)

Employees 1000-2000000; models ent. Examples: CDC or HHS program office; VA clinic system; Army or Air Force IT programme; NASA centre; DHS component.

**Sourced**
- FAR thresholds from 2025-10-01: micro-purchase $10,000 to $15,000; simplified acquisition threshold $250,000 to $350,000 (https://www.ncmbc.us/far-thresholds-are-changing-on-october-1-2025/); check FAR 2.101
- SBIR/STTR lapsed ~6 months after 2025-09-30; reauthorised through 2031-09-30 by P.L. 119-83 signed 2026-04-13 (https://www.everycrsreport.com/reports/IN12705.html)
- GSA OneGov launched April 2025 with 17 technology agreements claiming discounts up to 90%, self-reported (https://www.gsa.gov/blog/2026/01/12/restoring-common-sense-to-government-acquisition, 2026-01-12)
- FedRAMP CR26 dates (mandatory 2027-01-01) from Knox Systems conflict with FedRAMP milestones; verify (https://knoxsystems.com/resources/fedramp-news-2026, 2026-07)
- DoD obligated $93.4B in Sept 2025 (https://govintegrity.substack.com/p/washingtons-september-spending-spree, citing Open the Books)

**[design] estimates stored in the data**
- ACV $25k-$200k; qualified win rate 15%; annual churn 7%; buyer is the user 20% of the time.
- Cycle days: <$5k 3-14; $5-25k 7-45; $25-100k 30-120; >$100k 90-540.
- Committee at typical ACV: about 6.6 roles and 6.2 non-user people. Roles that can block: contracting officer (0.8), security (0.75), champion (0.7), technical (0.7).
- Procurement: card limit $15k; quotes from $15k; RFP from $350k; board approval 0% above none; fiscal year starts month 10; budgets set in months 1, 2, 3; payment net-30, PO required; cooperative contracts: GSA Multiple Award Schedule, GSA OneGov.
- Paperwork (probability, from ACV): sam_registration 100%, w9 100%, coi_insurance 90%, vpat 80% (>= $15k), fedramp 60% (>= $15k), security_questionnaire 70% (>= $15k), gsa_schedule 35% (>= $50k), msa_redlines 30% (>= $50k), rfp_response 50% (>= $350k).
- Method: **MEDDPICC**, critical elements paperProcess, decisionCriteria, economicBuyer, competition. Heavy paper-process focus: the CO, programme office and ISSO each hold a distinct gate. Help write the decision criteria in the solicitation; economic buyer is programme-office funds, not the CIO.
- Most likely scenarios: FedRAMP or ATO gap blocks the award (60%); Forced open competition above the SAT ($350k) (50%); Reseller takes the deal (40%).
- Seasonality: busy months 7, 8, 9, slow 12, 1. DoD obligated $93.4B in September 2025, $50.1B in the last five working days; about 32% of annual contract dollars fall in the last three months (2015 Bloomberg Government, dated).
- Solo-founder fit: **0.2**.

**Choices and flags.** FAR thresholds are sourced (micro-purchase $15,000 and SAT $350,000 from 2025-10-01) but check FAR 2.101. FedRAMP cost conflicts across notes ($250k-$1M+ in g8; $250k-$2M and $500k-$4M in g9, consultants, [unverified]); chose $250k-$1.5M and 12-36 months. FedRAMP CR26 dates (Knox, secondary) conflict with the FedRAMP milestone table. GSA schedule cost and OTAs were not researched. GSA OneGov discounts are self-reported. The 32% last-quarter obligation share is from a 2015 Bloomberg analysis.

### Group: education

#### K-12 school districts (`k12`)

Employees 10-20000; models smb + ent. Examples: rural district of 800 students; suburban district of 12,000 students; charter network of 5-20 schools.

**Sourced**
- EdWeek Research Center (223 leaders, cited secondhand): 37% of purchases took 6-11 months, 22% took 12-17 months, 78% six months or longer (https://prospeo.io/s/edtech-go-to-market-strategy, undated, unverified)
- California district bid threshold $114,800 from 2025-01-01 (https://www.lcwlegal.com/news/bid-threshold-increased-to-114800-for-community-college-and-school-district-contracts/, 2025-01-06); NY model policy $20,000 for supplies (https://www.niskayunaschools.org/board-of-education/board-policies/board-of-education-policy-5400-purchasing-procurement-of-goods-and-services/)
- NCSL: 46 states start the fiscal year on July 1 (https://www.ncsl.org/state-legislatures-news/details/almost-all-states-began-new-fiscal-year-with-enacted-budgets, FY2025)
- Amended COPPA rule effective 2025-06-23, compliance due 2026-04-22 (https://www.govinfo.gov/content/pkg/FR-2025-04-22/html/2025-05904.htm, 2025-04-22)
- ESSER funds are gone (https://edtechmagazine.com/k12/article/2026/08/esser-funds-are-gone-heres-how-k-12-it-leaders-replace-them-perfcon, 2026-08-07)
- SDPC registry: 130,000+ signed DPAs, 12,000+ districts, 6,674 providers; NDPA v2.2 published 2025-11-19 (https://www.wsipc.org/news/version-two-of-sdpcs-national-data-privacy-agreement-is-available)

**[design] estimates stored in the data**
- ACV $4k-$35k; qualified win rate 21%; annual churn 16%; buyer is the user 10% of the time.
- Cycle days: <$5k 14-60; $5-25k 60-150; $25-100k 150-300; >$100k 270-540.
- Committee at typical ACV: about 5.7 roles and 7.8 non-user people. Roles that can block: board (0.7), technical (0.7), champion (0.6), privacy (0.6).
- Procurement: card limit $2.5k; quotes from $10k; RFP from $50k; board approval 50% above $25k; fiscal year starts month 7; budgets set in months 1, 2, 3, 4, 5; payment net-45, PO required; cooperative contracts: Sourcewell, OMNIA Partners, TIPS, BuyBoard, state buying groups.
- Paperwork (probability, from ACV): w9 100%, coi_insurance 80%, sdpc_ndpa 85%, security_questionnaire 60% (>= $5k), vpat 50% (>= $5k), vendor_portal 30%, soc2_type2 30% (>= $25k), dpa 30%, board_packet 50% (>= $25k), rfp_response 25% (>= $50k).
- Method: **MEDDPICC**, critical elements champion, economicBuyer, decisionProcess, paperProcess. MEDDPICC with Process (board calendar, bid rule) and Paper (NDPA, security form, insurance) tracked from call one. SPIN for teacher discovery; Challenger is too aggressive for a privacy-fearful principal.
- Most likely scenarios: Bottom-up adoption, no admin knows (30%); Deal crosses the board threshold (25%); Privacy review stalls (25%).
- Seasonality: busy months 10, 11, 1, 2, 3, 5, slow 6, 8, 12. About 80% of purchases close May-July (nationgraph, secondary); October is a planning window, not a close window; renewals are often not auto-renewals.
- Solo-founder fit: **0.35**.

**Choices and flags.** The EdWeek stat (37% 6-11 months, 22% 12-17 months, 78% six months or longer) is secondhand and [unverified]; SaaSHero's 12-18 months is vendor-sourced. Bid thresholds are state law (CA $114,800, NY $20,000 for supplies, TX reportedly $100k, unconfirmed) so 50k is a middle [design] value. The COPPA school-authorisation exception was not finalised. NDPA v2.2 detail (2025-11-19) comes from a secondary legal reference.

#### Colleges and universities (`higher_ed`)

Employees 200-50000; models smb + ent. Examples: community college of 8,000 students; regional public of 15,000; private liberal-arts college of 2,000; R1 university with a medical school.

**Sourced**
- P-card limits: ASU $10,000/transaction (guide.pdf, 2025-02); Colorado $5,000 (up to $10,000), 2025-08; Montclair $3,000 (2025-12); GWU $3,000; Liberty $2,500; LMU $1,500 (https://www.asu.edu/purchasing/forms/guide.pdf; https://www.colorado.edu/cmdi/media/7953; https://inside.montclair.edu/documents/p-card-cardholder-approver-overview; https://procurement.gwu.edu/sites/g/files/zaxdzs4691/files/downloads/ProcurementCardFINAL.pdf; https://www.liberty.edu/finance-admin/procurement/wp-content/uploads/sites/135/P-Card-Policy.pdf; https://finance.lmu.edu/controller/accountspayable/pcard/)
- HECVAT reported at 4.1.5, released 2025-02-10; sources disagree on numbering (https://www.saltycloud.com/blog/what-is-the-hecvat, vendor)
- HECVAT review turnaround: 5-10 business days (Montclair), 4-12 weeks full assessments (Toledo), 4-6 weeks (USNH) (https://inside.montclair.edu/administration/information-technology-division/information-security/vendor-assessment-hecvat)
- Higher-ed purchase cycles 3-9 months (SaaSHero, unsourced) vs 6-18 months (getmonetizely, secondary) (https://www.saashero.net/strategy/edtech-marketing-school-cycles-2026/, 2026-07-11)

**[design] estimates stored in the data**
- ACV $3k-$25k; qualified win rate 21%; annual churn 12%; buyer is the user 30% of the time.
- Cycle days: <$5k 14-45; $5-25k 45-120; $25-100k 120-240; >$100k 270-540.
- Committee at typical ACV: about 6.8 roles and 6.8 non-user people. Roles that can block: technical (0.8), security (0.8), champion (0.6), privacy (0.6).
- Procurement: card limit $3k; quotes from $15k; RFP from $100k; board approval 5% above $250k; fiscal year starts month 7; budgets set in months 1, 2; payment net-40, PO required; cooperative contracts: Sourcewell, OMNIA Partners.
- Paperwork (probability, from ACV): w9 100%, coi_insurance 80%, hecvat 80% (>= $5k), vpat 70% (>= $5k), security_questionnaire 40% (>= $5k), soc2_type2 50% (>= $25k), dpa 60%, sole_source_justification 20% (>= $25k), rfp_response 25% (>= $100k).
- Method: **MEDDPICC**, critical elements paperProcess, economicBuyer, champion, decisionCriteria. HECVAT, VPAT and FERPA treated as an early paper step, not a late hurdle. SPIN for faculty; value selling for deans framed around enrolment, retention or accreditation.
- Most likely scenarios: HECVAT requested mid-deal and you don't have one (30%); Department buys on P-card, central IT blocks later (25%); LMS integration required (20%).
- Seasonality: busy months 1, 2, 3, 9, 10, slow 5, 6, 7, 12. Departmental budget requests due Jan-Feb; renewals often need a fresh HECVAT each year; October-January is the window for next-year deals.
- Solo-founder fit: **0.3**.

**Choices and flags.** Cycle claims conflict: SaaSHero 3-9 months (unsourced) vs getmonetizely 6-18 months (secondary). HECVAT version numbering conflicts across sources (4.1.5 reported, 2025-02-10); check EDUCAUSE. P-card limits vary from $1,500 to $10,000; many SaaS subscriptions are blocked on P-cards by policy.

### Group: nonprofit

#### Nonprofits and associations (`nonprofits`)

Employees 1-500; models smb. Examples: food bank with 12 staff and 200 volunteers; community foundation with 5 staff; state trade association with 2,000 members; museum with 30 staff.

**Sourced**
- Most nonprofits spend under 3% of budget on tech; only 13% spend above 5%; for-profits average about 6% (Clarion Research, 350+ leaders) (https://www.philanthropy.com/news/5-key-findings-from-our-nonprofit-technology-survey/, 2025-06-04)
- Microsoft 365 Business Basic donated up to 300 licences; Business Premium and Office 365 E1 stopped being donated 2025-07-01 (TechSoup guide, last verified 2026-05-17, secondary: https://techempower.notion.site/TechSoup-org-The-First-Step-to-Accessing-Technology-Grants-c5368a3c54164ff1920df252144b7457)
- Many funders do not fund technology and some restrict grant dollars for software or cybersecurity (same Chronicle of Philanthropy survey, 2025-06-04)

**[design] estimates stored in the data**
- ACV $500-$6k; qualified win rate 22%; annual churn 27%; buyer is the user 40% of the time.
- Cycle days: <$5k 1-14; $5-25k 14-56; $25-100k 60-120; >$100k 120-270.
- Committee at typical ACV: about 3.8 roles and 3.7 non-user people. Roles that can block: board (0.7), champion (0.6), finance (0.5), technical (0.5).
- Procurement: card limit $3k; quotes from none; RFP from none; board approval 40% above $10k; fiscal year starts month 1; budgets set in months 10, 11, 12; payment net-30.
- Paperwork (probability, from ACV): w9 50%, nonprofit_verification 50%, coi_insurance 15% (>= $5k), dpa 20% (>= $5k), board_packet 30% (>= $5k).
- Method: **Value selling**, critical elements champion, metrics, economicBuyer. Impact framing (hours saved, donors kept, grant reports filed); light MEDDIC with champion and budget source critical. Check restricted funds and a donated-product alternative early.
- Most likely scenarios: Donated product competes with your paid tier (30%); ED buys on card, board asks later (25%); No tech champion; volunteer-run IT (25%).
- Seasonality: busy months 10, 11, 12, 1, slow 7, 8. Renewals line up with grant cycles and fiscal years; staff turnover, grant endings and budget cuts drive churn.
- Solo-founder fit: **0.6**.

**Choices and flags.** The Chronicle of Philanthropy / Clarion survey (350+ leaders) is the only primary number. TechSoup terms (Microsoft donations ended for Business Premium and E1 on 2025-07-01) come from a secondary guide and Google programme terms could not be confirmed. Aggregator cycles (SMB 38 days, mid-market 78 days) are rough.

#### Churches and religious organizations (`churches`)

Employees 1-200; models smb. Examples: 60-attendee Baptist church with one part-time admin; 400-member Catholic parish; 2,500-attendee multi-campus nondenominational church.

**Sourced**
- About 380,000-420,000 US congregations (https://ministrywatch.com/amp/are-100k-churches-closing-in-america/, undated estimate)
- Median weekly attendance fell from 137 to 65 between 2000 and 2020; about two-thirds of congregations under 100 people (Faith Communities Today 2020: https://hirr.hartfordinternational.edu/wp-content/uploads/2024/11/A-Portrait-of-the-2020-Faith-Communities-Today-Study-Article-Theology-Today.pdf)
- Pushpay study of 1,700+ church leaders: support and implementation guidance grew in importance versus price (https://www.religionunplugged.com/news/2025/4/30/new-study-reveals-key-tech-trends-shaping-the-us-church, 2025-04-30; vendor-linked)

**[design] estimates stored in the data**
- ACV $300-$3k; qualified win rate 20%; annual churn 20%; buyer is the user 35% of the time.
- Cycle days: <$5k 14-90; $5-25k 90-180; $25-100k 150-270; >$100k 180-365.
- Committee at typical ACV: about 4.1 roles and 4.6 non-user people. Roles that can block: champion (0.7), board (0.7), finance (0.5), technical (0.5).
- Procurement: card limit $1k; quotes from none; RFP from none; board approval 30% above $3k; fiscal year starts month 1; budgets set in months 11, 12; payment card or prepaid.
- Paperwork (probability, from ACV): child_safety_policy 40%, dpa 30%, pci_attestation 30%, coi_insurance 10%.
- Method: **Value selling**, critical elements champion, pain, economicBuyer. Tie value to ministry outcomes (volunteers placed, first-time guests followed up, giving processed). Full MEDDIC is too heavy; the admin is the champion and the budget owner must be named.
- Most likely scenarios: Pastor says yes, admin has used X for ten years (30%); Elders or finance board must vote (20%); Staff turnover (20%).
- Seasonality: busy months 1, 2, 8, 9, slow 6, 7, 12. Avoid Holy Week and Christmas; renewals lapse when an annual meeting cuts the budget.
- Solo-founder fit: **0.7**.

**Choices and flags.** Congregation counts and attendance come from estimates and a secondary-quoted Faith Communities Today figure. Church-management market size is a paid analyst teaser. Pushpay material is vendor-authored. No win rate was found; 0.2 is [design].

## 4. Data-quality concerns and how they were resolved

1. **Segment count.** The brief says 29 segments; the notes contain 30 (see header). All are included. If one must go, `franchise_systems` and `hotels` overlap most with other segments.
2. **Almost everything operational is [design].** The notes say so repeatedly: web coverage for retail, restaurants, trades, hospitality, churches and most procurement thresholds was thin. Treat cycle, committee, win-rate, card-limit and churn values as calibration priors.
3. **Committee size.** Gartner 5-16 (primary) vs Forrester 13 + 9 (secondary) vs Starr 3.1/6.8/11.2 (unverified and self-contradictory). See 1.1.
4. **No-decision rate.** Four unverified claims between 40% and 59%; 40-50% planning range [design]. See 1.3.
5. **Multithreading.** +130% win rate and "2x contacts" vs 67% are correlational and conflicting; the game discounts them. See 1.4.
6. **Win rates.** Bridge Group 19% for 2024 (down from 23% in 2022, secondary via Everstage and Jiminny) and Gong about 21% are general SaaS numbers. Segment win rates of 15-28% are [design]. Note that `SALES.winRates` in `public/apps/sales/params.js` is 30%/23%/17% by ACV; a segment value is best used as a *relative* factor (segment win rate / 0.23) on that curve rather than as a replacement.
7. **Cycle lengths.** Public-sector, hospital and pharma cycles in the notes (6-24 months) are much longer than `SALES.cycles` in params.js (for example 90-180 days up to $500k). Use `cycleDaysFor()` for segment-specific deals and keep the generic table as the fallback. Anchors conflict inside segments (hospitals 3-18 vs 18-24 months, pharma 120-365 days vs 6-18 vs 18-24 months, higher-ed 3-9 vs 6-18 months); the data uses the middle of the conflict and the notes' own ACV band.
8. **Vendor paperwork costs.** SOC 2, FedRAMP, GovRAMP and pen-test ranges conflict between guides; the narrower credible range was chosen and the conflict recorded in the `PAPERWORK` notes. Founder hours for HECVAT, SIG, BAA, DPA, NDPA and VPAT are [design].
9. **Seasonality meaning.** `busy` means "good months to sell", not "buyers are busy working". The insurance note lists Oct-Jan as the agencies' busiest workload, so those months are marked slow for selling; tax-season accounting firms are likewise slow Jan-Apr.
10. **Law firms and health practices** mix very different buyers (solo to AmLaw; independents to DSOs). The segment holds the small-buyer profile and models the large buyer through `minAcv` roles and the >$100k cycle. Split the segment if the game needs both populations at once.
11. **Dated or low-quality sources kept as context only:** DaySmart 2019, InMotion 2018, RXO 2020, Dental Economics 2003, a 1995 franchise addendum, Techaisle 2021, a 2015 Bloomberg Government analysis, a 2008 agency-revenue study.
12. **Items to verify before quoting to a player:** FDA CSA guidance date, HIPAA Security Rule final date, NERC CIP-013-4 status, FedRAMP 20x/CR26 dates, GovRAMP state deadlines (UT, NV), Texas school bid threshold, Gunnison UT threshold, NAR report year, SIG question counts, HECVAT version, Sourcewell/OMNIA fees, COPPA school-authorisation exception.

## 5. Using the data

- `segmentFor({ industry, employees, name, model })` maps a prospect to a segment id (keyword match on industry and name, employee-band fit, model nudge; falls back to `startup_smb` under 100 employees, `mid_market` for 100-999, `enterprise` from 1,000).
- `committeeFor(id, acv, rand)` samples a committee; `cycleDaysFor(id, acv, rand)` samples a cycle; `paperworkFor(id, acv, rand)` lists the required paperwork with sampled hours, cost and days.
- Scenario `effect` fields (`cycleMult`, `winMult`, `needsRole`, `paperwork`, `stallDays`) are applied by the caller; `needsRole` names a committee role that must be engaged or the deal stalls or is lost.
