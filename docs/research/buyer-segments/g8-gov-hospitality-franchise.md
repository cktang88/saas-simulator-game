# G8 buyer segments: government (city/county, state, federal), hospitality, franchise systems

Research date: 2026-10-14. Sourced numbers carry a URL and access date. Estimates are marked [design]. Several secondary sources conflicted or were vendor marketing; those are flagged. Verify any dollar threshold against the governing code before quoting it to a buyer.

---

## Segment 1: City and county government

### 1. Size & examples
- Municipalities and counties range from under 5,000 residents (a few staff, no purchasing office) to 1M+ (departmental procurement, IT governance). [design]
- Examples: a county IT/records office, a city parks & recreation department, a public works or water utility, a police records unit, a city clerk's office, a county assessor.
- Typical software-buying unit is a single department with a budget of $5k–$250k per year. [design]

### 2. Buying committee
| Role | Typical titles | Typical count | Influence (0–1) | Main concerns | Can block? | Present |
|---|---|---|---|---|---|---|
| User | Dept staff, clerks, inspectors | 3–20 | 0.3 | Ease of use, replaces a spreadsheet or paper | Indirectly | Daily |
| Champion | Department head, deputy director | 1 | 0.7 | Solves a visible backlog, budget line | Yes, if they lose the budget fight | Weekly |
| Economic buyer / signer | City manager, county administrator, department director, or council (above threshold) | 1 signer + council vote above threshold | 0.8 | Budget, liability, political optics | Yes | Occasional |
| IT / technical | IT director, GIS or systems admin | 1–2 | 0.6 | Integration with existing systems, hosting, SSO | Yes (IT can refuse to support) | Once or twice |
| Security | Often IT security officer; in larger counties, a CISO | 0–1 | 0.5 | Data classification, CJIS for police data | Yes, rarely | Late stage |
| Legal | City attorney, county counsel | 1 | 0.5 | Indemnity, data-ownership, governing-law clauses | Yes, on contract redlines | Late stage |
| Procurement | Purchasing agent, procurement manager | 0–1 (absent in small towns) | 0.6 | Bid compliance, sole-source justification | Yes, if the buy is above the informal threshold | Mid to late |
| Finance | Finance director, auditor | 1 | 0.5 | Appropriation, fiscal year, P-card rules | Yes | Late stage |
| Council / board / commission | Elected council, county commissioners | 5–7 | 0.5 below threshold, 0.9 above | Public scrutiny, vendor relationships | Yes, can vote no or table | Only above threshold |
| Public / unions | Residents, bargaining units (for workforce tools) | varies | 0.2–0.5 | Job-displacement, privacy | Yes, in public comment | Rare |

- Buyer is not the user in most cases: about 60–70% of city and county purchases are signed by someone other than the daily user. [design]
- Council approval typically appears above a jurisdiction's formal bid threshold, so buyers below that threshold rarely meet a council.

### 3. Cycle & deal size
- Under $5k: 1–14 days, usually a P-card buy by the department head. [design]
- $5k–$25k: 2–8 weeks, usually two or three quotes or a department-level approval. [design]
- $25k–$100k: 2–6 months, quotes plus, in many cases, a council agenda item. [design]
- Over $100k: 6–18 months, formal RFP and council vote. [design]
- Typical ACV for a small vendor: $3k–$30k. [design]
- Win rate on qualified opportunities: no reliable source found. [design] 25–40% when the champion has budget and a fiscal-year slot; under 15% for an unannounced formal RFP.

### 4. Procurement
- P-card single-transaction limits vary widely. Spokane, WA (2025 policy) sets a default of $1,000 per transaction and $5,000 per month, with a ceiling of $5,000 per transaction and $25,000 per month (https://static.spokanecity.org/documents/opendata/policies/2025/admin-5600-25-01.pdf, accessed 2026-10-14). Los Altos, CA sets $2,500 per item (https://cityoflosalamitos.org/DocumentCenter/View/4965, accessed 2026-10-14). Martinsville, VA sets $1,500 per purchase and $3,500 per month (https://martinsville-va.gov/DocumentCenter/View/1999, accessed 2026-10-14). The practical rule: assume a $1,000–$2,500 card limit, so SaaS above that needs a PO.
- Informal (no-bid) thresholds: a GovTech analysis of 97 large cities found 37 at $50,000 and 16 at $25,000, with Colorado Springs the highest at $200,000 (https://govtech.com/biz/data/finding-the-magic-line-below-which-cities-can-buy-stuff-easily.html, undated, accessed 2026-10-14). Loma Linda, CA lists $25,000 for formal competitive bidding (https://starbridge.ai/buyer/city-of-loma-linda, secondary). Gunnison, UT raised its informal limit from $500 to $5,000 in March 2026 (council meeting AI summary; verify minutes at https://cpo.soar.com/articles/7701701/Gunnison/Sanpete-County/Utah/Council-raises-no-bid-procurement-ceiling-from-500-to-5000).
- Fiscal year: most US cities and counties start July 1 or October 1; budgets are set in spring (March–June) for July starts. [design]
- Payment: net-30 standard, PO-driven; net-45 to net-60 in some counties. [design]
- Required paperwork: W-9, certificate of insurance (general liability $1M is common, cyber $1M–$2M increasingly required), SOC 2 Type II or a completed security questionnaire, VPAT for accessibility, a data-processing or data-ownership clause. CJIS addendum for police data. Vendor registration on a city portal. [design]
- GovRAMP: some states and cities now ask for it; see Segment 2. [design]

### 5. Channels
- Works: direct calls and emails to department heads; in-person demos at the department; state municipal league and county association conferences (e.g., state city-county associations); peer referral from another city; public-sector user groups; cooperative contracts (Segment 2).
- Fails: cold email to a generic "procurement@" address; LinkedIn ads targeting "city government"; trade-show booths unless the product is a category leader; marketplaces with no buyer traffic.
- Best times: avoid the first two weeks after the budget passes and the month before the fiscal year ends (budget lapse); Jan–Mar is the planning window for July starts. [design]
- Tech-savviness: low to medium; IT is often understaffed, so a no-integration first deal is easier. [design]

### 6. Methodology
- Best fit: a value-selling plus MEDDIC-lite approach: quantify the department's backlog hours, identify the champion and the budget line, and map the approval path (threshold, council agenda deadlines).
- Critical elements: Metrics (hours saved, fines collected, permits processed), Economic buyer (who signs under the threshold), Decision process (the exact procurement steps), Paper process (W-9, COI, security questionnaire), and Champion strength (who will carry it to council). BANT is too weak because "budget" in government is a line item and a fiscal-year timing question.

### 7. Scenarios
1. **Buyer is not the user (very common, ~60–70%) [design].** The department head wants it, the user wants it, but the city manager won't sign. Handle: build a one-page memo the champion can present, with cost, a sunset clause and a sole-source justification if needed.
2. **Champion leaves or retires (~10–15% per year in local government) [design].** Handle: multi-thread early (two users and one signer) and keep the contract in a renewal calendar.
3. **Hidden blocker in IT or security (~30% of deals above $25k) [design].** Handle: send the security packet before the demo and ask IT directly: "what would prevent you from approving this?"
4. **Forced RFP just above the formal threshold (~20–30% of deals in the $25k–$100k band) [design].** Handle: decide early whether to shape the RFP criteria (ask the champion to request your features in the scope) or walk away if the criteria favor an incumbent.
5. **Budget freeze or fiscal-year slip (~15% of deals in a downturn) [design].** Handle: propose a pilot under the informal threshold paid from another line (e.g., grant funds or a P-card) and convert at the next fiscal year.
6. **Bottom-up adoption by staff on a P-card, then a conversion request.** Handle: convert to a county-wide or department contract with a price step-up; have a PO-ready quote.

### 8. Common objections
- "We have to go out to bid for anything over our threshold." Reply: "Which threshold, and does the pilot fall under it? We can start under it and you'll have your own data before any bid."
- "We're not allowed to pay for SaaS out of operating funds." Reply: "Would the subscription fit your existing software line? Here's the appropriation language some cities use."
- "Our IT department has to approve every application." Reply: "We can start with a SSO-only, no-data-import pilot so IT's risk is minimal."
- "We have no budget until July." Reply: "Can we sign a letter of intent in the current year, with the first invoice in July?"

### 9. Churn & seasonality
- Annual gross churn: 8–12% for local government, mostly from budget cuts and staff turnover. [design]
- Renewal dynamics: renewals are a budget event, so cancellation decisions happen 60–90 days before the fiscal year. [design]
- Busy months: January–April (planning and council approvals); slow months: July (new budget year), December (holidays). [design]

### 10. Solo-founder fit
- 0.5. Workable only with a department-level, sub-threshold product and a champion who can carry the paperwork. Full RFP cycles are a poor fit for 1–3 people.

### 11. Sources
- https://static.spokanecity.org/documents/opendata/policies/2025/admin-5600-25-01.pdf (2025 policy; accessed 2026-10-14)
- https://cityoflosalamitos.org/DocumentCenter/View/4965/501---Purchasing-Card-Program-Cal-Card-PDF (accessed 2026-10-14)
- https://martinsville-va.gov/DocumentCenter/View/1999 (accessed 2026-10-14)
- https://govtech.com/biz/data/finding-the-magic-line-below-which-cities-can-buy-stuff-easily.html (accessed 2026-10-14)
- https://starbridge.ai/buyer/city-of-loma-linda (secondary, accessed 2026-10-14)
- https://cpo.soar.com/articles/7701701/Gunnison/Sanpete-County/Utah/Council-raises-no-bid-procurement-ceiling-from-500-to-5000 (AI meeting summary, March 2026; verify)
- https://gplpen.hks.harvard.edu/wp-content/uploads/2023/06/Are-Procurement-Thresholds-Slowing-You-Down.pdf (2023)

---

## Segment 2: State government (GovRAMP, NASPO ValuePoint, Sourcewell/OMNIA, RFP thresholds, council approval)

### 1. Size & examples
- A state's executive branch covers 20k–100k employees across agencies. Buyers include health and human services, revenue, corrections, education (state-level only), transportation, and the state university system.
- Examples: a state Department of Health, a state DOT, a state HR system, a state Medicaid agency's case-management vendor.
- Typical software deal size: $25k–$500k for a single agency; statewide contracts $500k+. [design]

### 2. Buying committee
- Roles mirror Segment 1, with more depth: **agency program director** (champion), **agency CIO/IT** (technical), **state CISO or security office** (security, often an external review), **state purchasing office** (procurement), **Attorney General's office** (legal, required on contracts above a dollar threshold), **Office of Management and Budget / State CFO** (finance), **legislature or budget committee** (board-like; influence on appropriations, not individual purchases), **state auditor** (post-award review), **accessibility office** (VPAT scrutiny).
- Typical count: 6–12 people in a meaningful procurement, 3–4 in a cooperative buy. [design]
- Influence scores (design): champion 0.7; CIO 0.6; state CISO 0.7 (blocks on GovRAMP status); purchasing 0.6; AG 0.5; OMB 0.6; legislature 0.3 (rarely per deal).
- Buyer is not the user in roughly 70–80% of state contracts. [design]

### 3. Cycle & deal size
- Under $5k: 1–4 weeks (agency P-card or purchase order against an existing contract). [design]
- $5k–$25k: 1–3 months, usually via a cooperative contract or a small-purchase quote. [design]
- $25k–$100k: 3–9 months, a formal solicitation or a cooperative order. [design]
- Over $100k: 9–18 months, RFP and sometimes legislative appropriation. [design]
- Gartner's public-sector cycle estimate of about 22 months is cited in a secondhand Substack post and reflects large multi-stakeholder purchases; use it only as an upper bound (https://pinerycapital.substack.com/p/not-on-the-panel-687, accessed 2026-10-14).
- Typical ACV for a small vendor: $15k–$150k. [design]
- Win rate: no source; [design] 15–25% on a formal RFP where the vendor qualifies; 40%+ if the vendor is already on a cooperative contract.

### 4. Procurement
- **GovRAMP (formerly StateRAMP)**: state-level cloud security standard built on NIST SP 800-53 Rev 5. Deadlines vary by state:
  - North Carolina: GovRAMP required for the executive branch starting April 1, 2026, with full compliance by April 1, 2027 (https://www.doa.nc.gov/pandc/understanding-govramp-agency-procurement-overview/download; secondary summary, accessed 2026-10-14).
  - Arizona: renewal contracts from July 1, 2026 carry risk-assessment requirements aligned with GovRAMP or FedRAMP (https://govramp.org/programs/arizona, accessed 2026-10-14). One secondary source says this applies to new and renewal contracts; check the solicitation.
  - Texas: TX-RAMP for state agencies and public higher education, with a GovRAMP reciprocity review (secondary).
  - Utah and Nevada: reported as 2025 and July 1, 2026 respectively by one vendor guide (unverified).
  - Fast Track lets FedRAMP-authorized vendors reuse packages with separate continuous monitoring. [design] Lists of participating states conflict across sources; verify with GovRAMP (info@govramp.org).
- **NASPO ValuePoint**: a cooperative contract run by one lead state's purchasing office. Other states join through a participating addendum that can add state-specific terms. Public entities only. Vendors win the cooperative's bid by category on its schedule; there is no open enrollment.
- **Sourcewell** and **OMNIA Partners**: cooperative contracts won through each cooperative's own bid cycle, which can be years apart. OMNIA also serves private-sector buyers. Sourcewell posts open and upcoming solicitations publicly; register in the supplier portal before a bid opens (secondary: https://civiciq.com/blog/how-to-get-on-a-cooperative-purchasing-contract, accessed 2026-10-14).
- **Vendor fees on cooperative contracts**: not verified. Commonly a percentage of sales paid as an administrative or reporting fee; check each cooperative's vendor pages before quoting. [design]
- **RFP thresholds**: set by statute and vary by state; I did not find a verified state-by-state table in this research. Treat formal bid thresholds as $25k–$100k in most states with informal quotes below. [design]
- **Council/board approval**: state contracts rarely go to a legislature; agency-level approval is common, with legislative approval needed for appropriations and for contracts above a dollar limit in some states. [design]
- **Fiscal year**: 46 states start on July 1; budgets are set in the legislative session (January–June). [design]
- **Payment**: net-30 to net-45, PO-driven. [design]
- **Paperwork**: W-9, certificate of insurance, VPAT, SOC 2 Type II, GovRAMP or TX-RAMP status, DPA, state-specific security questionnaire, and sometimes a data-residency clause. [design]

### 5. Channels
- Works: cooperative contract listings (Sourcewell, OMNIA, NASPO); state association conferences; in-person meetings with state program staff; partnerships with systems integrators that already hold state contracts; a GovRAMP or TX-RAMP status letter sent early.
- Fails: cold outbound to an agency's central mailbox; trade-show booths with no state-level program; marketplaces without a contract vehicle.
- Best times: legislative session (January–June) for budget news; avoid the final weeks of the fiscal year when purchasing slows. [design]
- Tech-savviness: medium to high for security and IT teams; low for program staff. [design]

### 6. Methodology
- Best fit: MEDDPICC, because the decision process and paper process are long and formal, and the economic buyer is often a deputy director or a budget office.
- Critical elements: Paper process (GovRAMP status, security questionnaire, accessibility review), Decision process (mapped by state purchasing rules), Identify Champion (who writes the requirements), and Competition (whether a cooperative contract already covers the need).

### 7. Scenarios
1. **Forced RFP above the state threshold (~40% of state deals over $25k) [design].** Handle: get into the requirements phase; ask the champion for measurable criteria; prepare a GovRAMP-ready package in advance.
2. **GovRAMP status missing when the state requires it (common since 2026 deadlines) [design].** Handle: start the GovRAMP assessment now (or a TX-RAMP review if relevant); if the state accepts "in progress," sign a letter with a date.
3. **Cooperative contract already covers the category (~30% of state software demand routed through co-ops) [design].** Handle: find the co-op and the participating-addendum state; sell as an order against an existing contract, which skips the RFP.
4. **Budget freeze at the state level (~15–20% of deals in a downturn) [design].** Handle: propose a pilot funded from a grant or an existing contract line item and plan for the next session.
5. **Agency IT blocks an integration (~25% of deals with IT approval) [design].** Handle: negotiate a no-integration first phase with SSO-only and a security review in phase two.
6. **Legislative-appropriation requirement for a large contract [design].** Handle: align the pitch with the appropriation cycle and get a champion to carry it to the budget committee.

### 8. Common objections
- "We have to use a cooperative contract." Reply: "Which one, and what is your timeline for the next bid category? We can get listed or sell under the one you already use."
- "Your product isn't GovRAMP authorized." Reply: "Here is our status letter and assessment date. Can we start a pilot under your current contract terms?"
- "We need to see an RFP." Reply: "Our product fits these criteria; here is a draft of the requirements in your RFP language."
- "Our budget is set for next fiscal year." Reply: "Can we sign a letter of intent now with a start date in the next fiscal year?"

### 9. Churn & seasonality
- Annual gross churn: 7–10%, lower than local government; state contracts often auto-renew. [design]
- Renewal dynamics: multi-year state contracts renew by solicitation or by option year; missing the option-year notice can force a rebid. [design]
- Busy months: January–June (budget and legislative cycle), August–September (end of fiscal year for July-start states). [design]

### 10. Solo-founder fit
- 0.2–0.3. Cooperative contracts and sub-threshold agency buys are feasible; formal state RFPs and GovRAMP certification take months and cost money. A 1–3 person company should target one cooperative contract and one agency.

### 11. Sources
- https://govramp.org/programs/arizona (accessed 2026-10-14)
- https://programs.govramp.org/?p=2590 (accessed 2026-10-14)
- https://www.doa.nc.gov/pandc/understanding-govramp-agency-procurement-overview/download (accessed 2026-10-14)
- https://knoxsystems.com/resources/stateramp (accessed 2026-10-14)
- https://knoxsystems.com/resources/govramp (accessed 2026-10-14)
- https://civiciq.com/blog/how-to-get-on-a-cooperative-purchasing-contract (accessed 2026-10-14)
- https://www.nationgraph.com/glossary/omnia-partners (vendor glossary, accessed 2026-10-14)
- https://pinerycapital.substack.com/p/not-on-the-panel-687 (accessed 2026-10-14)

---

## Segment 3: Federal government (FedRAMP 20x, SBIR, GSA Schedule, micro-purchase, OTAs, Q4 spending, resellers)

### 1. Size & examples
- Federal civilian and defense buyers: about 2.2M federal civilian employees plus defense, with many agencies buying software. [design]
- Examples: a CDC or HHS program office, a VA clinic system, an Army or Air Force IT program, a NASA center, a DHS component.
- Typical software deal size: $5k (micro-purchase) to $10M+. Most small-vendor deals: $25k–$500k. [design]

### 2. Buying committee
- **Contracting Officer (CO)**: signs the award; influence 0.8; can block by refusing the award; present for every award.
- **Program manager / COR (Contracting Officer's Representative)**: the champion; influence 0.7; manages the work after award.
- **Agency CIO / IT security (ISSO, ISSM)**: influence 0.7; can block on ATO (authority to operate); present late.
- **Chief Information Security Officer and the FedRAMP / ATO review board**: influence 0.8 for cloud services.
- **Small Business Office (OSBP)**: influence 0.5; can designate a set-aside.
- **Legal / general counsel**: 0.5; review of terms.
- **Finance / budget office (fiscal year, appropriations)**: 0.6.
- **Users**: program staff or analysts; influence 0.3.
- Typical count: 6–10 for a mid-size award. [design]
- The buyer is not the user in most federal cases (about 80%+). [design]

### 3. Cycle & deal size
- Micro-purchase (under $15,000): days to 2 weeks, via a government purchase card. [design]
- $15k–$350k (simplified acquisition): 1–4 months, quotes from GSA schedule holders or open-market. [design]
- $350k–$1M: 3–9 months. [design]
- Over $1M: 9–18 months, full competitive procurement. [design]
- Gartner's 22-month estimate for public-sector tech procurement (secondhand) applies to large multi-stakeholder buys; the federal figure is lower for schedule buys. [design]
- Typical small-vendor ACV: $25k–$200k. [design]
- Win rate: no verified source. [design] 10–20% on open competitive bids; higher on schedule buys if the vendor is already listed.

### 4. Procurement
- **Micro-purchase threshold**: raised from $10,000 to $15,000 and the simplified acquisition threshold (SAT) from $250,000 to $350,000, effective October 1, 2025 (final rule issued August 27, 2025, 90 FR 41872; https://www.ncmbc.us/far-thresholds-are-changing-on-october-1-2025/, accessed 2026-10-14). Check FAR 2.101 at acquisition.gov before quoting.
- **GSA Multiple Award Schedule (MAS)**: a vendor needs its own schedule or must be sold through a holder. Carahsoft's own site says its older GS-35F-0119Y contract is only used for BPA business and points to MAS 8F 47QSWA18D008F (https://www.carahsoft.com/buy/gsa-schedule-contracts/gsa-schedule-70, accessed 2026-10-14). Cost to obtain a schedule was not found.
- **GSA OneGov**: launched April 2025; 17 agreements with technology companies and discounts "up to 90%" per GSA's own January 2026 blog (https://www.gsa.gov/blog/2026/01/12/restoring-common-sense-to-government-acquisition, accessed 2026-10-14). Self-reported; treat savings claims as unverified. OneGov deals are with large vendors; a small vendor's realistic path is a reseller or a schedule.
- **SBIR/STTR**: lapsed for about six months after authority expired on September 30 / October 1, 2025. The Small Business Innovation and Economic Security Act (P.L. 119-83) was signed April 13, 2026, reauthorizing both programs through September 30, 2031. Agencies are restarting solicitations unevenly; the Department of War resumed first (https://www.everycrsreport.com/reports/IN12705.html and https://www.mondaq.com/unitedstates/government-contracts-procurement-ppp/1774902/sbirsttr-programs-reauthorized-after-six-month-lapse, accessed 2026-10-14). New Phase II "strategic breakthrough" awards up to $30M; tighter foreign-influence screening from FY2027. A software vendor should expect the first new solicitations in late 2026 or early 2027. [design for timing]
- **FedRAMP**: a cloud service sold to federal agencies needs FedRAMP authorization (Low, Moderate, High). The 20x program moved to a consolidated ruleset: per Knox Systems, the Consolidated Rules for 2026 (CR26) launched June 25, 2026, with optional early adoption from July 4, 2026 and mandatory adoption January 1, 2027 (https://knoxsystems.com/resources/fedramp-news-2026, July 2026; secondary). The FedRAMP site's own milestone table and the Knox pilot dates conflict; verify on fedramp.gov. A-LIGN reports that Low-impact authorization no longer requires an agency sponsor (https://www.a-lign.com/resources/what-is-fedramp/, accessed 2026-10-14). Most commercial SaaS is not Low-impact; FedRAMP Moderate is the realistic target and costs roughly $250k–$1M+ in total assessment and remediation. [design, cost estimate]
- **OTAs (Other Transaction Authorities)**: used for prototypes and emerging tech (DoD, DHS, NASA). Not researched in this pass; [design] usually a prototype phase of $100k–$1M with fast decisions, but limited to specific agencies.
- **Q4 spending**: agencies rush to obligate expiring funds before September 30. DoD obligated $93.4B in September 2025, of which $50.1B came in the last five working days; about $5.9B of September spending went to IT and telecom (govintegrity Substack citing Open the Books, https://govintegrity.substack.com/p/washingtons-september-spending-spree, accessed 2026-10-14). A 2015 Bloomberg Government analysis reports about 32% of annual contract dollars obligated in the last three months since 2009 (secondary, dated).
- **Payment**: Net-30 standard, Prompt Payment Act; invoices paid in 30 days on average. [design]
- **Paperwork**: SAM.gov registration (UEI), NAICS codes, small-business representation, W-9, certificate of insurance, FedRAMP status or agency ATO, Section 508 / VPAT, DFARS or CMMC for defense (CMMC Level 1 or 2 self-assessment or C3PAO), data-handling clauses.

### 5. Channels
- Works: GSA schedule holders and resellers (Carahsoft: over 3,200 reseller partners as of 2025 per a third-party summary; vendor pre-vetting by GSA is stated on Carahsoft's site); SBIR topics aligned with an agency's needs; agency-specific conferences (e.g., AWS Summit DC, Gartner IT Symposium for federal, GovExec events); partnerships with prime contractors; small-business associations; industry days; Q4 timing for budget-ready programs.
- Fails: cold email to federal officials without a sponsor; trade-show booths for unrelated agencies; general SaaS marketplaces; LinkedIn outbound to "federal IT" without a clearance or a schedule.
- Best times: Q4 (July–September) for funds that must be spent; January–March for new fiscal-year budgets [design].
- Tech-savviness: high in IT and security roles; low in program offices. [design]

### 6. Methodology
- Best fit: MEDDPICC with a heavy paper-process focus. The buyer, the CO, and the ISSO each have distinct gates.
- Critical elements: Paper process (SAM registration, FedRAMP or ATO status), Economic buyer (program office funds, not the CIO), Decision criteria (written in the solicitation; the vendor should help write them), Competition (incumbent and schedule holders), and Identify champion (the COR).

### 7. Scenarios
1. **Forced open competition above the SAT ($350k) (~50% of federal deals above $350k) [design].** Handle: get involved in the statement of work before the solicitation; prepare a FedRAMP and VPAT package; price for a competitive bid.
2. **Micro-purchase buy via government purchase card (~30% of small-vendor federal wins) [design].** Handle: make the card path easy (Stripe-compatible invoicing, a card-accepting checkout) and build a schedule-ready price list.
3. **FedRAMP or ATO gap blocks the award (~60% of cloud deals) [design].** Handle: check whether the agency will accept a provisional ATO; if not, sell a non-cloud or on-prem option, or partner with a FedRAMP-authorized host.
4. **Q4 fund expiry (~30% of federal awards in July–September) [design].** Handle: target the Q4 window with a fast schedule order; expect to be asked to deliver within 60 days.
5. **Reseller only (Carahsoft or similar take the deal) (~40% of schedule-driven buys) [design].** Handle: register with the reseller's partner program; accept a margin that is 15–30% below direct [design] and ask for co-selling.
6. **SBIR award is a proof point but not a sale.** Handle: use the Phase I award to build a Phase II pitch; expect 12–24 months from Phase I to a production contract. [design]

### 8. Common objections
- "We can only buy off the schedule." Reply: "Which holder carries your category? We can work through them while we get our own schedule or a reseller arrangement."
- "Your product needs FedRAMP." Reply: "Here is our status and timeline; we can start with a Low or non-cloud deployment."
- "We're already under a OneGov agreement." Reply: "Do they cover this function? If not, we can sell as an add-on through a reseller."
- "We don't have an ATO." Reply: "Could we start with a limited ATO or a sandbox environment with no federal data?"

### 9. Churn & seasonality
- Annual gross churn: 5–8% on multi-year awards; churn comes from re-competition at option-year expiry. [design]
- Renewal dynamics: option years must be exercised by the CO; a missed notice can end a contract. [design]
- Busy months: July–September (Q4 spend), with a surge in the last two weeks of September; slow months: late December and early January. [design]

### 10. Solo-founder fit
- 0.2. Possible via a reseller, a micro-purchase or an SBIR Phase I; a FedRAMP Moderate or a full competitive award is not realistic for 1–3 people. Use a reseller and aim for schedule-driven demand.

### 11. Sources
- https://www.ncmbc.us/far-thresholds-are-changing-on-october-1-2025/ (accessed 2026-10-14)
- https://www.pillsburylaw.com/en/news-and-insights/federal-acquisition-regulatory-council-inflation-thresholds.html (accessed 2026-10-14)
- https://www.everycrsreport.com/reports/IN12705.html (accessed 2026-10-14)
- https://www.mondaq.com/unitedstates/government-contracts-procurement-ppp/1774902/sbirsttr-programs-reauthorized-after-six-month-lapse (accessed 2026-10-14)
- https://www.gsa.gov/blog/2026/01/12/restoring-common-sense-to-government-acquisition (January 12, 2026; accessed 2026-10-14)
- https://knoxsystems.com/resources/fedramp-news-2026 (July 2026; secondary)
- https://www.fedramp.gov/docs/20x/phase1/intro/ (accessed 2026-10-14)
- https://www.a-lign.com/resources/what-is-fedramp/ (accessed 2026-10-14)
- https://govintegrity.substack.com/p/washingtons-september-spending-spree (accessed 2026-10-14)
- https://www.carahsoft.com/buy/gsa-schedule-contracts/gsa-schedule-70 (accessed 2026-10-14)
- https://static.carahsoft.com/concrete/files/2716/0553/4249/Carahsoft_Company_Overview_9.8.20_2.pdf (2020; background)

---

## Segment 4: Hotels and hospitality groups

### 1. Size & examples
- Independent hotels: 1–150 rooms, 5–60 staff, often owner-operated. [design]
- Management companies and groups: 10–1,000+ properties; examples include Crescent Hotels & Resorts, Hilton Supply Management (brand-level), and Westmont Hospitality Group, all named in a May 2026 Hotel Interactive panel report on hotel procurement (https://hotelinteractive.com/?p=35134 and https://hoteltechreport.com/resources/operations/buyers-guides/property-management-systems/hotel-procurement-software, accessed 2026-10-14).
- Typical software deal size: $1k–$15k per property per year for ops tools; group-level contracts $100k+. [design]

### 2. Buying committee
- **Property GM (general manager)**: champion for a single hotel; influence 0.7; concerns: guest experience, staff hours, P&L. Present: weekly. Often the signer at independent hotels.
- **Owner or asset manager**: influence 0.8 at managed hotels; signs capex and tech above a threshold; concerns: capex, ROI, brand standards.
- **Director of operations / regional VP**: influence 0.7 at groups; can block; concerns: standardization across properties.
- **Director of revenue / sales**: 0.6; concerns: group-sales CRM, RFP tools.
- **Procurement (group supply management)**: 0.6 at groups, absent at independents; concerns: price, contract terms, preferred-vendor lists. Adam Butts (Crescent) and Clay Snyder (Hilton) appear in a May 2026 panel on procurement's strategic role (Hotel Interactive, accessed 2026-10-14).
- **IT / brand technology**: 0.6 at brands; concerns: PMS integration, PCI, data privacy.
- **Finance / controller**: 0.5.
- **Front-desk or F&B staff (user)**: 0.3.
- Typical count: 2–3 at independents; 5–8 at management companies. [design]
- Buyer is not the user in about 60% of hotel software deals. [design]

### 3. Cycle & deal size
- Under $5k (one property, ops tool): 2–6 weeks. [design]
- $5k–$25k (one property or small group): 1–3 months. [design]
- $25k–$100k (management company, multi-property): 3–6 months. [design]
- Over $100k (brand or group-wide): 6–12+ months. [design] Protel's Pete Simpson argues that even with management backing, sourcing, buying and deploying takes "many months" (opinion piece: https://www.hotel-yearbook.com/article/4092737.html, accessed 2026-10-14).
- No verified hotel-specific cycle benchmark was found. The Bridge Group figures (Q4 2025 report: median ACV $32K, cycle 91 days) are reported only on a secondary page and could not be verified, so do not quote them.
- Typical ACV for a small vendor: $3k–$25k. [design]
- Win rate: no verified source. [design] 20–30% on qualified independent-hotel deals; 10–15% on group RFPs.

### 4. Procurement
- P-cards: common at independents; per-transaction limit often $2,500–$5,000 [design].
- Quote thresholds: independents rarely formalize; groups often require three quotes above $10k–$25k [design].
- Board approval: rarely for a hotel; owner or investor approval for capex above a threshold at managed properties; brand approval for brand-mandated vendors.
- Fiscal year: most hotels run on a calendar year; budgets are set in Q4 (October–December) for January starts. The SaaSHero lead-gen article notes Q4 is budget planning season and that multi-stakeholder approvals are slowing in 2026 (https://www.saashero.net/uncategorized/hotel-tech-lead-gen-strategies/, updated June 23, 2026; marketing-informed).
- Payment: net-30 standard; often card-based for independents. [design]
- Paperwork: W-9, certificate of insurance, PCI attestation (if payments touch card data), SOC 2 Type II for groups, DPA, a data-residency clause for EU guests. [design]
- Brand-mandated vendors: a brand-managed hotel often must use a preferred vendor list, which can block a direct sale at a branded property.

### 5. Channels
- Works: industry associations (HFTP, AH&LA, state hotel associations); hotel tech conferences and trade shows (Hotel Tech Report's buyer guide lists product categories); peer referral from a GM or a regional VP; direct outreach to a management company's operations leader; integrations with major PMS platforms (Opera, Mews, Cloudbeds) listed in their marketplaces.
- Fails: cold email to independents without a referral; generic SaaS marketplaces; paid social targeting "hotel managers."
- Best times: October–December (budget planning); avoid peak occupancy weeks for the GM (summer, holiday periods). [design]
- Tech-savviness: low at independents; medium at groups. [design]

### 6. Methodology
- Best fit: value-selling with a light MEDDIC for groups. The GM buys on operational pain (labor hours, guest complaints); the group buys on standardization and data. Use a short ROI calculation based on labor saved per property.
- Critical elements: Pain (specific to the property type), Economic buyer (owner or regional VP), and Champion (the GM or the director of operations).

### 7. Scenarios
1. **Buyer is the owner or asset manager, not the GM (~40%+ of managed-hotel deals) [design].** Handle: send the GM a one-page ROI memo they can forward to the owner.
2. **Brand-mandated preferred-vendor list blocks the purchase [design].** Handle: check the brand's approved-vendor list before the demo; if you're not on it, pivot to independents or get a brand partner program listing.
3. **Management company wants a pilot at 3 properties before group rollout (~30% of group deals) [design].** Handle: price the pilot as a per-property rate with a rollout discount; set a 90-day success metric.
4. **Procurement forces an RFP for a group deal [design].** Handle: get on the RFP list early; prepare a standard security and data packet; expect to match a price floor.
5. **GM champion leaves or the property changes hands (~20–30% per year at managed properties) [design].** Handle: add the regional VP as a second contact; track property changes via news and LinkedIn.
6. **Q4 budget freeze at owners [design].** Handle: propose a pilot now with a January start.

### 8. Common objections
- "We already have a PMS with that feature." Reply: "Which module is it, and what's the adoption rate? We integrate, so we're not replacing it."
- "The brand won't let us use outside vendors." Reply: "Is there a brand approval path? We can provide the security packet the brand requires."
- "Labor is our main cost; we can't add another tool for staff." Reply: "Could you show me the hours spent on the process now? Our tool removes two manual steps per shift."
- "We'll look at it next year." Reply: "Can we set up a Q1 pilot with a start date and a success metric?"

### 9. Churn & seasonality
- Annual gross churn: 15–25% at independents; 8–12% at groups with multi-year contracts. [design]
- Renewal dynamics: churn spikes when a property changes management or brand; renewals are often in Q4 with budgets. [design]
- Busy months: October–December (budget), January (kick-off); slow months: late summer and holiday weeks. [design]

### 10. Solo-founder fit
- 0.6. Independents and small management companies are reachable for a solo founder via referrals and integrations; group RFPs and brand approvals are not. Focus on one PMS integration and a referral network.

### 11. Sources
- https://hotelinteractive.com/?p=35134 (May 2026; accessed 2026-10-14)
- https://www.hotel-yearbook.com/article/4092737.html (accessed 2026-10-14)
- https://www.saashero.net/uncategorized/hotel-tech-lead-gen-strategies/ (June 23, 2026; marketing-informed)
- https://hoteltechreport.com/resources/operations/buyers-guides/property-management-systems/hotel-procurement-software (2026; boilerplate, low evidentiary value)
- https://community.gbta.org/browse/toolkits/accommodations/additional-content (GBTA; corporate RFPs, weak proxy)

---

## Segment 5: Franchise systems (selling to the franchisor vs individual franchisees; approved-vendor lists)

### 1. Size & examples
- Franchisor corporate: 20–500 corporate staff, managing 50–10,000+ franchised units. [design]
- Individual franchisees: owner-operators with 1–20 units, 5–100 employees each. [design]
- Examples: QSR brands (McDonald's, Subway-type systems), home services (Jackson Hewitt, Buildertrend-adjacent trades), fitness (Anytime Fitness-type studios), hotels under franchise agreements, salons and childcare.

### 2. Buying committee
- **Franchisor CIO / CTO** (corporate): influence 0.8; can mandate a system across units; concerns: integration, data access, cost to franchisees.
- **Franchisor VP of franchise operations or franchise support**: influence 0.7; manages the approved-supplier list.
- **Franchisor procurement / supply chain**: influence 0.6; negotiates national-account pricing.
- **Franchisor legal (franchise counsel)**: 0.6; reviews FDD Item 8 (required disclosure of mandatory suppliers) and the franchise agreement.
- **Franchisor CFO**: 0.5; cares about tech-fee revenue and disclosure.
- **Franchisee owner-operator**: influence 0.7 at their own unit; often the signer for individual purchases; concerns: cost, labor, local customers.
- **Franchisee operations manager / store manager (user)**: 0.3.
- **Franchise advisory council (franchisee association)**: 0.5 at large systems; can push back on tech fees.
- Typical count at franchisor: 5–8; at franchisee: 1–3. [design]
- Buyer is not the user in 70%+ of cases. [design]

### 3. Cycle & deal size
- Franchisee unit purchase under $5k: 1–4 weeks, owner decides, may be limited to approved vendors. [design]
- Franchisee $5k–$25k: 1–3 months, owner plus possibly the franchisor's approval. [design]
- Franchisor system-wide deal $25k–$100k: 3–6 months, requiring legal and FDD review. [design]
- Franchisor system-wide over $100k: 6–12+ months. [design]
- Typical ACV: franchisee $1k–$10k per unit per year; franchisor-wide $50k–$500k. [design]
- No verified win-rate source. [design] 15–25% at franchisors with a formal approved-supplier process; 30%+ at franchisees who already use the system's core tech.

### 4. Procurement
- **Approved-supplier and approved-vendor lists**: the franchisor authorizes vendors to sell to its franchisees; some approve several per category (franchisees buy from any of them), while others approve only one to keep the system uniform (https://afranchisecoach.com/glossaries/approved-supplier-vendor, accessed 2026-10-14).
- **Mandated technology**: a franchisor can generally require a specific point-of-sale or other system if disclosed in the FDD and written into the franchise agreement. The scope of the mandate varies by state law (https://www.heritagelawwi.com/force-franchisee-to-buy-specific-pos-system, undated, accessed 2026-10-14). Software mandates (POS, CRM, ordering, booking) are described as routine (https://cfa.ca/start-me-up-considerations-for-franchisors-when-mandating-the-use-of-software-by-franchisees/, March 2025).
- **Tech-fee disputes**: FTC staff guidance treats undisclosed franchisor fees as improper; 2025 was expected to bring more franchisee disputes over tech fees (Polsinelli 2024 recap: https://www.polsinelli.com/publications/2024-recap-of-franchise-developments-and-2025-trends-to-watch, accessed 2026-10-14). McDonald's agreed to cut US technology fees by 62% after a third-party billing review, per a report citing Bloomberg (https://thespoon.tech/following-tensions-mcdonalds-cuts-tech-fees-for-franchisees-by-62-percent/, undated, accessed 2026-10-14). Vendors must make their pricing transparent, or the franchisor will not add them.
- **National accounts**: a franchisor may negotiate a national-account price; old franchise addenda (e.g., a 1995 Princeton Review addendum) capped franchisee discounts at the lesser of $50 or 15% (https://contracts.justia.com/companies/princeton-review-inc-35517/contract/895422, accessed 2026-10-14). Structure is typical; the amounts are dated.
- **Franchisor tech spending**: 75% of franchisors expected to increase technology and innovation capital spending in 2025 (FRANdata, March 2025: https://frandata.com/franchisors_are_doubling_down_on_technology, accessed 2026-10-14).
- **Payment**: franchisor-negotiated accounts often bill the franchisor and pass through; franchisees pay net-30 directly on their own accounts. [design]
- **Paperwork**: franchisor vendor application, insurance certificate naming the franchisor as additional insured, data-access and audit-rights clauses, PCI for payment data, a DPA. [design]

### 5. Channels
- Works: franchise-industry associations (IFA, Franchise Times events, franchise expos); a franchisor's supplier-approval program; franchise consultants; franchisee advisory councils; integrations with the franchisor's core system (POS, ordering).
- Fails: direct cold outreach to individual franchisees across many brands (low response, high churn); generic SaaS marketplaces; franchise-resale brokers.
- Best times: franchisors plan technology in Q3–Q4 for the next year [design]; franchisee purchases cluster around renewal and new-unit openings.
- Tech-savviness: high at the franchisor; low to medium at owner-operators. [design]

### 6. Methodology
- Best fit: two methods. For the franchisor, MEDDPICC with an approved-supplier focus (a long, paper-heavy sale). For franchisees, value selling with a simple ROI per unit, plus a 30-day pilot.
- Critical elements at the franchisor: Identify the approval gate (approved-supplier committee), Paper process (FDD, legal), Economic buyer (VP of franchise ops and CFO), and Champion (the head of franchise support).
- Critical elements at franchisees: Pain per unit, Economic buyer (the owner), and Pilot.

### 7. Scenarios
1. **Sell to the franchisor, not the franchisee (~70% of system-wide deals) [design].** Handle: get on the approved-supplier list first; then sell to franchisees with a franchisor-negotiated price.
2. **Franchisee wants to buy directly but the franchisor mandates a different vendor [design].** Handle: check the agreement; if the vendor is not on the list, request an approval and propose a pilot at one unit.
3. **Franchisor approves a single supplier and the vendor loses (~20% of mandated categories) [design].** Handle: plan for the loss; negotiate a non-exclusive or regional listing.
4. **Tech-fee revolt from franchisees (~10–15% of big systems per year) [design].** Handle: make the cost per unit transparent and tie it to measurable savings; expect the franchisor to demand a cut.
5. **Bottom-up adoption by franchisees who need a conversion to a corporate deal [design].** Handle: convert to a system-wide national account with a price step-up and a franchisor-approved supplier listing.
6. **Franchisor's legal review kills the deal over data-access terms [design].** Handle: pre-clear the audit-rights and data-portability clauses with the franchisor's counsel before the demo.

### 8. Common objections
- "We can only buy from approved suppliers." Reply: "Can you tell me how a vendor gets on the list, and what the approval timeline is?"
- "Our franchise agreement requires a specific system." Reply: "Would you consider a complementary tool that integrates with it, rather than replacing it?"
- "The tech fee is too high." Reply: "Here is the per-unit cost and the measured savings from a pilot unit."
- "We won't pay for anything that isn't in the FDD." Reply: "We can list our fees in the FDD Item 8 update or in a franchisee disclosure."

### 9. Churn & seasonality
- Annual gross churn: 10–15% at franchisees (closures and sales of units); 5–8% at franchisors on system-wide contracts. [design]
- Renewal dynamics: system-wide renewals tied to the franchise agreement's term; franchisee renewals tied to unit sales and openings. [design]
- Busy months: Q3–Q4 for franchisor budgets; January for franchisee budgets. [design]

### 10. Solo-founder fit
- 0.3. Selling to individual franchisees is feasible only through a franchisor-approved listing or a channel partner; direct franchisor sales need a long approval process. A solo founder should first earn one brand's approved-supplier listing, then sell to its franchisees.

### 11. Sources
- https://afranchisecoach.com/glossaries/approved-supplier-vendor (accessed 2026-10-14)
- https://www.heritagelawwi.com/force-franchisee-to-buy-specific-pos-system (accessed 2026-10-14)
- https://cfa.ca/start-me-up-considerations-for-franchisors-when-mandating-the-use-of-software-by-franchisees/ (March 2025)
- https://www.polsinelli.com/publications/2024-recap-of-franchise-developments-and-2025-trends-to-watch (accessed 2026-10-14)
- https://thespoon.tech/following-tensions-mcdonalds-cuts-tech-fees-for-franchisees-by-62-percent/ (accessed 2026-10-14)
- https://frandata.com/franchisors_are_doubling_down_on_technology (March 2025)
- https://contracts.justia.com/companies/princeton-review-inc-35517/contract/895422 (1995 addendum; dated)
- https://www.hughes.com/resources/insights/managed-services/five-tips-franchisors-choose-right-technology-partners (October 16, 2023)
