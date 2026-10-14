# G6 Regulated and asset-heavy buyers: banks, credit unions, financial services, insurance, manufacturing, utilities

Research pass: October 14, 2026. Figures are marked with a source and date where found. Anything marked [design] is my estimate or general practice without a citable source. Several sales-cycle figures come from vendor marketing and conflict with each other; they are flagged as such.

---

## 1. Banks, credit unions and financial services

### Size & examples
- US insured banks: 4,238 institutions reporting in the FDIC Q2 2026 Quarterly Banking Profile (released Aug 25, 2026). About 3,818 community banks reported Q2 2026 net income (ABA summary, Aug 2026). Source: https://www.fdic.gov/news/press-releases/2026/fdic-insured-institutions-reported-return-assets-126-percent-and-net ; https://bankingjournal.aba.com/2026/08/quarterly-banking-profile-banking-net-income-90-1b-in-q2-2026/
- Federally insured credit unions: 4,214 at June 30, 2026, down from 4,370 a year earlier (NCUA Q2 2026 data summary). Source: https://ncua.gov/files/publications/analysis/quarterly-data-summary-2026-Q2.pdf
- Credit unions at or under $100M in assets: about 2,830 as of Q4 2023 (927 under $10M, 1,904 at $10–100M). This is the latest breakdown I found and is dated. Source: https://bettermarkets.org/wp-content/uploads/2024/11/Better-Markets-Comment-Letter-NCUA-Budget.pdf
- Examples: community banks ($100M–$1B assets, 5–150 staff) and rural credit unions with 5–40 staff; larger regionals and money-center banks run vendor committees. Fintechs, wealth managers, and small broker-dealers are in the same bucket [design].
- Staff size bands for community banks: [design] 20–150 FTE for most under $1B.

### Buying committee
Typical roles for a community bank or credit union. Count is per deal; influence is 0–1 [design].

| Role | Typical titles | Count | Influence | Main concern | Can block | Present |
|---|---|---|---|---|---|---|
| User | Loan officer, teller lead, ops analyst, BSA officer | 2–6 | 0.4 | Workflow, time saved | Soft | Daily |
| Champion | VP of operations, CIO/IT director, innovation officer | 1 | 0.7 | Fit to exam findings | No | Often |
| Economic buyer / signer | CEO/president, CFO | 1 | 0.8 | Cost, board optics | Yes | Late |
| IT / technical | IT manager (often outsourced to core provider) | 1–2 | 0.6 | Integration with core, access | Yes | Often |
| Security / vendor risk | Information security officer, vendor manager | 1 | 0.7 | SOC 2, pen test, data handling | Yes | Required |
| Compliance / BSA | Compliance officer, BSA officer | 1 | 0.5 | Exam defensibility, BSA/AML | Yes for regulated data | Mid |
| Legal | Outside counsel, GC | 0–1 | 0.4 | Contract, liability, DPA | Yes on terms | Late |
| Finance | Controller | 0–1 | 0.4 | Accounting, invoicing | Rarely | Late |
| Board / credit or audit committee | Board members | 0–1 | 0.5 | Material third-party risk | Yes for critical vendors | At approval |
| Core provider | Fiserv, FIS, Jack Henry, Q2, Temenos partner | 0–1 | 0.6 | Integration, conflicts | Yes | Often |

Seeing ~9 roles on a community bank deal is typical. The buyer is not the user in most cases (roughly 70–80% of the time) [design]. Core providers are a real blocker when the product needs a core integration.

### Cycle & deal size
Sources conflict. Treat these as planning ranges, not benchmarks:
- Bank procurement and integration: Temenos research cited by Chronicle.lu and Euromoney says procurement can run up to 18 months, plus up to 18 months of integration (vendor-cited, undated, accessed Oct 2026). https://chronicle.lu/category/fintech/28042-lhoft-deloitte-luxembourg-launch-fin5lab ; https://www.euromoney.com/article/27bjsstsqxhkmh1wmk68x/fintech/b-hive-strives-to-boost-collaboration-between-banks-and-fintechs/
- RegTech to banks: 8–18 months average (Saas Hero, updated Aug 6, 2026; a marketing consultancy). https://www.saashero.net/strategy/marketing-regtech-to-banks/
- Estimated by band for a small bank or credit union [design]:
  - under $5k: 14–45 days (often a card purchase, no vendor review)
  - $5–25k: 45–120 days
  - $25–100k: 90–240 days (full vendor due diligence)
  - over $100k: 6–18 months (board approval, legal)
- General SaaS benchmark for reference: median cycle ~91 days, median ACV ~$32k (Bridge Group 31st AE Metrics Report, reported secondhand at pulserevops.com; not verified against the primary report). https://pulserevops.com/knowledge/q157
- Small-vendor ACV at community banks: $5k–$30k [design].
- Win rate on qualified opportunities: not found. [design] 15–25%.

### Procurement
- Credit card limits and P-card thresholds: not found in this pass. [design] Most community banks allow card purchases under $5k, with a vendor review required above that.
- Quotes: most banks want 3 quotes under a set threshold [design]. Board approval is required above a threshold set in the bank's vendor policy (often $100k) [design].
- Fiscal year: calendar year for most banks. Budgets are approved in Q4 for the next year [design].
- Payment terms: net-30 or annual upfront; many banks pay by ACH [design].
- Paperwork, typical: W-9, certificate of insurance (cyber/E&O), SOC 2 Type II or a SIG Lite (128 questions in the 2025 version) or SIG Core (627 questions) when the vendor touches customer data. Source: https://www.rescana.com/learn/frameworks/sig-questionnaire/ ; https://grc.mitratech.com/sig-questionnaire-guide
- Other: DPA, pen test summary, data-location and subcontractor list, incident-notice clause (often 24–72 hours), BCP/DR summary, and an exit plan [design].
- Regulatory frame: the joint interagency third-party guidance (OCC Bulletin 2023-17, June 2023) asks banks to scale due diligence to risk and criticality. Source: https://www.mofo.com/pdf/resources/insights/230620-banking-agencies-issue-joint-third-party . The 2024 community-bank guide is optional. Source: https://occ.gov/news-issuances/bulletins/2024/bulletin-2024-11.html . A proposed revision with comments due Nov 16, 2026 was reported by one law-firm alert; verify before relying on it. Source: https://clsbluesky.law.columbia.edu/?p=72302
- For credit unions: NCUA says examiners hold the credit union responsible for vendor failures; state regulators (e.g., Washington DFI B-25-02) expect initial and ongoing due diligence, SOC 2 review, and annual board reporting on critical vendors. Sources: https://fortifydata.com/blog/ncua-third-party-risk-management-credit-unions/ ; https://dfi.wa.gov/sites/default/files/credit-unions/bulletins/B-25-02.pdf

### Channels
- Works: referrals from peer CIOs or CEOs at other community banks; state banker associations (ICBA state affiliates, state CU leagues); core-provider marketplaces and app directories; trade events (state bankers conferences); CUNA/credit union "league" events. Fintech marketplaces like Fiserv/Jack Henry app programs when the product integrates [design].
- Fails: cold email to bank executives (low reply), generic "AI" pitches, LinkedIn spam, trade show booths without a referral.
- Best times: avoid exam season and quarter-end close (last two weeks of each quarter; January for year-end) [design]. Mid-morning calls. Visits during conference weeks.
- Tech-savviness: low-to-medium; the IT function is often outsourced, so expect the core provider to handle integration.

### Methodology
MEDDPICC fits best for $25k+ deals because of the number of roles, the paper process, and the risk review. For sub-$5k, use BANT-lite with a single champion. Critical elements: Paper process (map the vendor-risk steps and owner); Economic buyer (who signs and who approves above threshold); Decision criteria (exam-defensible security evidence); Champion strength (someone who can carry the risk file internally). Challenger works for pitching an exam-finding or cost-of-manual-work insight.

### Scenarios
1. Buyer is not the user (~75%) [design]. Handle: sell to the risk and compliance owner with a SIG and a risk-tiered review; give the loan officer a demo, not the pitch. Probability 75%.
2. Champion leaves mid-review (~20%). Handle: multi-thread early; keep the vendor-review file in your CRM. Probability 20%.
3. Hidden core-provider blocker (~25%). Handle: ask in discovery which core and what integration rules apply; check the core's marketplace terms. Probability 25%.
4. Forced RFP at a regional or large bank (~30% above $100k). Handle: qualify out unless you can meet the RFP; respond with the SIG and references. Probability 30%.
5. Budget freeze or expense control (~10%). Handle: offer a smaller pilot or an annual prepay discount. Probability 10%.
6. Board approval needed (~30% above $100k). Handle: give the CEO a one-page risk and value summary; offer to present. Probability 30%.

### Common objections
- "We need a SOC 2 Type II before we can even start." Reply: "Here is our current SOC 2 bridge letter and SIG Lite; what evidence does your risk team need for this tier?"
- "Our core provider handles that." Reply: "Which parts? We integrate read-only via [method] and don't store [data]. Can we get your core's view on that?"
- "We can't put customer data in a new vendor." Reply: offer a data-minimized pilot with no PII.
- "Send us a formal proposal, we'll get back to you." Reply: ask who else is reviewing and what date the decision is set for.

### Churn & seasonality
- Annual churn: not found. [design] Bank vendor relationships are sticky: 5–10% annual logo churn for vendors in regulated workflows, with churn mostly tied to the core change or mergers (bank M&A is active, with 54 mergers in Q1 2026 per FDIC/ABA). Source: https://bankingjournal.aba.com/?p=65693
- Renewal dynamics: renewals go through vendor review again every 1–3 years, so start the review 120 days ahead [design].
- Busy: Q4 budget and planning, January. Slow: late July–August, and exam windows.

### Solo-founder fit: 0.35
Realistic path: sell only to credit unions or banks under $1B via referral and state leagues. Expect a 6–12 month cycle and a SOC 2 or pen-test requirement that a solo founder may not be able to meet until revenue supports it. Use a SIG Lite and a bridge letter as the early package.

### Sources
- https://www.fdic.gov/news/press-releases/2026/fdic-insured-institutions-reported-return-assets-126-percent-and-net (Aug 2026)
- https://ncua.gov/files/publications/analysis/quarterly-data-summary-2026-Q2.pdf (2026)
- https://bettermarkets.org/wp-content/uploads/2024/11/Better-Markets-Comment-Letter-NCUA-Budget.pdf (Nov 2024)
- https://www.mofo.com/pdf/resources/insights/230620-banking-agencies-issue-joint-third-party (June 2023)
- https://occ.gov/news-issuances/bulletins/2024/bulletin-2024-11.html (2024)
- https://clsbluesky.law.columbia.edu/?p=72302 (2026, single source)
- https://dfi.wa.gov/sites/default/files/credit-unions/bulletins/B-25-02.pdf (2025)
- https://fortifydata.com/blog/ncua-third-party-risk-management-credit-unions/ (2026, vendor blog)
- https://www.informationweek.com/it-leadership/connectone-bank-reveals-how-fintechs-can-survive-its-vendor-auditions
- https://www.mx.com/blog/buying-from-fintech-selling-to-banks/
- https://www.rescana.com/learn/frameworks/sig-questionnaire/ (2025)

---

## 2. Insurance carriers and agencies

### Size & examples
- Independent agencies: about 37,000 in the US, down from about 39,000 in 2024 but broadly stable over a decade. Average headcount 9.9 (up from 8.2 in 2024). 75% reported revenue growth 2024–2025. Source: Future One 2026 Agency Universe Study, via https://www.insurancejournal.com/news/national/2026/09/24/886639.htm and https://www.insurancebusinessmag.com/us/news/technology/independent-agency-revenue-rose-at-three-in-four-firms-as-ai-adoption-tripled-big-i-study-finds-590958.aspx (both Sept–Oct 2026).
- Examples: 3–50 person independent agencies (personal lines, commercial P&C, benefits); MGAs and wholesale brokers; regional carriers (mutuals, county farm bureaus); captive agencies of State Farm, Allstate, etc.
- Carriers: small regional carriers at 50–500 staff; large carriers thousands [design].
- Revenue per agency: no 2025–2026 average found. Most agencies are in the $150k–$1.25m range by a 2008 study (too old). [design] Typical independent agency $1–5m revenue.

### Buying committee
| Role | Typical titles | Count | Influence | Main concern | Can block | Present |
|---|---|---|---|---|---|---|
| User | Account managers, CSRs, producers | 3–15 | 0.4 | Speed, ease | Soft | Daily |
| Champion | Operations manager, AMS admin, VP operations | 1 | 0.7 | Time saved, retention | No | Often |
| Economic buyer | Agency principal / owner, or carrier SVP | 1 | 0.9 | Cost, carrier alignment | Yes | Yes |
| IT / technical | Outsourced MSP, internal IT lead (small) | 0–1 | 0.4 | Access, hosting | Yes | Mid |
| Security / privacy | Compliance officer, carrier vendor manager | 0–1 | 0.5 | NAIC data-security duties | Yes at carriers | Mid |
| Legal / contracts | Agency counsel, carrier legal | 0–1 | 0.3 | Liability | Rarely at agencies | Late |
| Finance | Controller, bookkeeper | 0–1 | 0.3 | Billing | Rarely | Late |
| Carrier (integration partner) | Carrier appointment or IT team | 0–1 | 0.6 | Approved-vendor status | Yes | Often |

The buyer is usually the principal, so the buyer is not the user for most deals (60–70%) [design]. At carriers, a vendor manager and information security can block.

### Cycle & deal size
Agency-level data is thin. Estimates [design]:
- Under $5k: 7–30 days, decided by the principal.
- $5–25k: 30–90 days, with a demo and trial.
- $25–100k: 60–180 days, usually when a carrier integration is needed.
- Over $100k (agency AMS replacement or carrier): 6–18 months with a committee.
- Carrier-level cycles are 9–24 months [design].
- Typical small-vendor ACV: $1.5k–$12k per agency per year [design].
- Win rate on qualified: [design] 20–30%.
- The Forrester Wave for insurance agency management systems (Q4 2025) names Zywave, Applied Systems, and EZLynx as Leaders, and lists customization needs and cloud versus on-prem as buyer criteria. Source: https://research.oz.spotlightar.com/reports/forrester-wave-insurance-agency-management-systems-q4-2025/market-definition

### Procurement
- Agencies: a card purchase is typical for small SaaS. No formal RFP. Payment is usually card or ACH monthly or annual [design].
- Carriers: vendor onboarding, a security questionnaire (SIG or carrier-specific), insurance certificate, financial stability check, a DPA or data processing schedule, and a breach notice clause. Carrier vendor management usually runs quarterly or annual reviews [design].
- NAIC Insurance Data Security Model Law (adopted Oct 2017) requires licensees to oversee third-party service providers and contractually require safeguards, breach notice, and indemnity. State adoption varies; the NAIC 2025 status was not confirmed. Source: https://www.daypitney.com/?p=11930
- Fiscal year: calendar year for most agencies; budgets set in Q4 [design]. Carriers often use calendar budgets set in Q3–Q4.
- Insurance paperwork: W-9, COI (cyber/E&O), SOC 2 (carriers), and state producer or appointment requirements for any tool that touches policy data [design].

### Channels
- Works: carrier and AMS integration marketplaces; agency associations (Independent Insurance Agents & Brokers of America, state associations, local agency groups); peer referrals among agency principals; the Big I Agency Universe Study and conference floors; Zywave and Applied partner programs.
- Fails: cold outreach to agency principals without a referral; "AI" pitches without an integration; email-only.
- Best times: avoid Oct–Jan renewal season (highest workload, Q4 and Jan 1 renewals) [design]. Reach agencies in late Feb–May or the summer.
- Tech savviness: mixed; small agencies have less IT, and the AMS is the core.

### Methodology
Value selling with a Challenger angle works best for agencies: quantify staff time saved on renewals and retention. For carriers, MEDDPICC. For small agency deals, BANT is enough. Critical elements: pain (retention or renewal workload), economic buyer (the principal), and integration with the AMS or carrier.

### Scenarios
1. Principal buys, staff don't like it (probability ~30%). Handle: run the trial with 2 CSRs, measure time saved, and set one champion per office.
2. Carrier integration required and not approved (~25%). Handle: check the carrier's vendor list early; offer a file-based workaround for the pilot.
3. AMS vendor lock-in (~35% for AMS-adjacent products). Handle: position as an add-on that reads from the AMS through an API, not a replacement.
4. Carrier security questionnaire blocks (~20% for carrier sales). Handle: have a SIG Lite and a SOC 2 bridge letter ready.
5. Seasonal freeze during renewals (~40% of deals stall Oct–Jan) [design]. Handle: schedule starts for Feb–May.
6. Bottom-up adoption by producers that must be converted to an agency license (~20%). Handle: convert at the principal level with usage data.

### Common objections
- "Our AMS already does this." Reply: "Which step still happens in spreadsheets or email? Show me the last renewal you handled."
- "We're not changing carriers' systems." Reply: "We read only and don't write to policy data. Can your IT lead confirm?"
- "Send me a security questionnaire." Reply: send the SIG Lite and ask what tier they need.
- "Call me in January." Reply: "Happy to, let's book the January slot and I'll send the trial plan now."

### Churn & seasonality
- Annual churn: [design] 8–15% for agency SaaS, with churn driven by agency acquisitions (agency M&A is active) and AMS switches.
- Renewal dynamics: annual renewals; agencies cut tools when budgets tighten in Q4.
- Busy: Q4 (renewal workload, budgets), Jan. Slow: summer, mid-year.

### Solo-founder fit: 0.6
Agencies with 3–20 staff are reachable and buy on card. Target the principal directly, price low, and avoid carrier-level integrations until revenue supports them.

### Sources
- https://www.insurancejournal.com/news/national/2026/09/24/886639.htm (Sept 2026)
- https://www.insurancebusinessmag.com/us/news/technology/independent-agency-revenue-rose-at-three-in-four-firms-as-ai-adoption-tripled-big-i-study-finds-590958.aspx (2026)
- https://research.oz.spotlightar.com/reports/forrester-wave-insurance-agency-management-systems-q4-2025/market-definition (Q4 2025)
- https://www.featuredcustomers.com/press-releases/the-top-insurance-agency-management-software-according-to-the-featuredcustomers-fall-2025-customer-s (fall 2025)
- https://www.daypitney.com/?p=11930 (NAIC model law, 2017)

---

## 3. Manufacturing plants (plant manager vs corporate, OT/IT, unions)

### Size & examples
- Manufacturing firms: 239,265 in 2022, about 98% under 500 employees (Census-derived, via an aggregator dated March 2026). Establishments: 284,452 in 2023, roughly 68% under 20 employees. Source: https://manufacturingleadgeneration.com/small-manufacturing-business-statistics/ (secondary; check Census County Business Patterns directly).
- Examples: 50–500 person job shops, food and beverage plants, plastics and metal fabrication, electronics assembly, and multi-plant mid-market companies (500–5,000 staff).
- Plant-level staff typically 50–400 [design].

### Buying committee
| Role | Typical titles | Count | Influence | Main concern | Can block | Present |
|---|---|---|---|---|---|---|
| User | Shift supervisors, production planners, quality techs, maintenance | 5–30 | 0.4 | Downtime, workload | Soft | Daily |
| Champion | Plant manager, operations director, continuous-improvement lead | 1 | 0.8 | Output, OEE, cost | No | Yes |
| Economic buyer | Plant manager (under $50k), VP Ops or corporate CFO (above) | 1 | 0.8 | Budget, capex vs opex | Yes | Late |
| IT | Corporate IT, plant IT lead, MSP | 1–3 | 0.7 | Network, access | Yes | Often |
| OT / controls | Controls engineer, automation lead, SCADA admin | 1–2 | 0.7 | Uptime, safety, PLC network | Yes | Mid |
| Security | CISO or corporate security, OT security lead | 0–1 | 0.6 | IEC 62443 posture, remote access | Yes | Mid |
| Quality / regulatory | QA manager, food-safety or FDA compliance | 0–1 | 0.5 | Validation, traceability | Yes in regulated plants | Mid |
| Procurement | Corporate procurement, plant buyer | 1 | 0.6 | Vendor master, terms | Yes | Late |
| Legal | Corporate counsel | 0–1 | 0.3 | Data, liability | Rarely | Late |
| Union / works council | Local union steward or president, HR/labor relations | 0–1 | 0.4–0.6 | Job impact, bargaining | Yes where it applies | Late |

Buyer is not the user for most deals (80% or more in plant-level software) [design].

### Cycle & deal size
- Survey-level: a CDW 2025 manufacturing survey found IT makes the final decision for most OT technology, with operations leaders involved. Source: https://webobjects2.cdw.com/is/content/CDW/cdw/field-marketing/mkt80853-manufacturing-infographic.pdf . A Connection OT e-book (undated) reports IT with 51% of purchase authority and operations with 29%. Source: https://www.connection.com/media/0b1jcxcw/protecting-ot-systems-ebook.pdf
- Cycle estimates [design]:
  - under $5k: 14–45 days (plant manager approves)
  - $5–25k: 45–120 days
  - $25–100k: 3–6 months with IT and OT review
  - over $100k: 6–12 months, corporate approval
- Typical small-vendor ACV: $8k–$40k per plant [design].
- Win rate: [design] 15–25%.

### Procurement
- P-cards: [design] plant managers often hold a card with a limit of $2k–$10k per transaction. Not verified.
- Quotes: 3 quotes above a threshold; RFP for multi-plant contracts [design].
- Fiscal year: often a non-calendar fiscal year. Capex budgets are set in Q3–Q4 [design].
- Payment: net-30 to net-60; PO required at corporate level [design].
- Paperwork: W-9, COI, SOC 2 or ISO 27001, OT network diagram questionnaire, remote access policy, a data processing agreement, and a vendor security questionnaire that covers OT connectivity.
- Frameworks: NIST SP 800-82 Rev. 3 expanded OT scope to supply chain and cloud topics. Source: https://www.nist.gov/node/1826641 ; IEC 62443-4-1 and -4-2 cover supplier and component requirements [design].

### Channels
- Works: trade shows (Hannover Messe, Automate, IMTS, ProMat), plant-manager peer groups (APICS/ASCM chapters, local manufacturing associations), system integrators, and machine vendors (OEM partner programs), plus integrations with MES and ERP platforms.
- Fails: IT-led cold outreach to plants; selling to the corporate office with no plant champion; purely digital outreach to plant managers.
- Best times: plant managers are on the floor early; reach them at 6–7am or in afternoon shift handover. Avoid plant shutdown weeks and quarter-end.
- Tech-savviness: medium at the plant level; high in corporate IT.

### Methodology
MEDDPICC for $25k+ or multi-plant deals; BANT or value selling for single-plant under $25k. Critical elements: Economic buyer (confirm who approves capex and opex), Champion (plant manager or continuous improvement lead), Decision criteria (OT security and uptime), and paper process (IT and OT sign-off). Challenger works well: show the cost of unplanned downtime or scrap.

### Scenarios
1. Plant manager loves it, corporate IT says no (~40%). Handle: offer a read-only, no-OT-network architecture with an IT-owned security review.
2. Union objection: software changes shift work or job tasks (~10% for unionized plants). Handle: check the contract for bargaining obligations; get HR and the union steward into a pilot if required. Do not skip this step.
3. OT security blocks cloud connection (~25%). Handle: edge agent or on-prem collector; avoid inbound connections.
4. Corporate RFP for multi-plant (~20% above $100k). Handle: respond with the SIG-equivalent and a plant reference.
5. Capex freeze in a downturn (~15%). Handle: convert to opex with a usage fee.
6. Bottom-up adoption on the floor that needs conversion (~30%). Handle: convert by documenting savings with plant data and taking it to the plant manager.

### Common objections
- "IT owns this." Reply: "Who in IT would sign the security review? I'll send them our architecture and a 30-minute call."
- "We don't connect the plant to the cloud." Reply: "Our collector is outbound only, on your network. Can I walk your OT lead through it?"
- "The union has to approve." Reply: "Understood. Which parts affect job tasks? I can prepare a summary for HR."
- "Send me pricing next quarter." Reply: "Let's agree on a pilot date and the success metric today."

### Churn & seasonality
- Annual churn: [design] 10–15% for plant software; churn is driven by plant closures and corporate consolidation.
- Renewal dynamics: multi-year contracts are common; corporate consolidation can force a switch.
- Busy: Q3–Q4 for capex planning, January for new budgets. Slow: summer shutdown weeks, year-end holiday.

### Solo-founder fit: 0.3
Hard for a solo founder: OT security reviews and corporate sign-off are slow. Possible with single-plant mid-market plants where the plant manager is the economic buyer and IT is light. Avoid anything that needs an OT network connection until you have a SOC 2 or IEC 62443 story.

### Sources
- https://webobjects2.cdw.com/is/content/CDW/cdw/field-marketing/mkt80853-manufacturing-infographic.pdf (2025)
- https://www.connection.com/media/0b1jcxcw/protecting-ot-systems-ebook.pdf (undated)
- https://www.abiresearch.com/market-research/product/7784792-industrial-and-manufacturing-survey-1h-202?hsLang=en (1H 2024, paid)
- https://www.nist.gov/node/1826641 (NIST SP 800-82r3)
- https://www.bls.gov/news.release/archives/union2_02182026.htm (2025 union data; manufacturing rate not retrieved)
- https://manufacturingleadgeneration.com/small-manufacturing-business-statistics/ (secondary)

---

## 4. Utilities (regulated, rate cases, NERC CIP)

### Size & examples
- Customers: 163.7 million ultimate customers in 2024 (EIA Table 2.1; 161.7m in 2023). Source: https://www.eia.gov/electricity/annual/html/epa_02_01.html
- Utility count: not found in this pass. [design] roughly 3,000 electric utilities filing EIA-861, most of them small co-ops and municipals.
- Examples: investor-owned utilities (IOUs) such as large regional holding companies; co-ops (e.g., rural electric co-ops); municipal utilities (city-run); water and gas utilities. Regulated IOUs may have 500–10,000 staff; co-ops and municipals 10–300 [design].
- Union rate: utilities had the highest unionization rate by industry in 2025 at 17.8% (BLS). Source: https://www.bls.gov/news.release/archives/union2_02182026.htm (2026 release).

### Buying committee
| Role | Typical titles | Count | Influence | Main concern | Can block | Present |
|---|---|---|---|---|---|---|
| User | Operations engineers, field crew leads, customer service reps, billing | 5–50 | 0.4 | Workflow, reliability | Soft | Daily |
| Champion | Director of operations, IT manager, regulatory affairs | 1 | 0.7 | Compliance, reporting | No | Often |
| Economic buyer | VP operations, CFO, CIO (IOUs); GM and board (co-op/muni) | 1 | 0.8 | Rate-recovery, budget | Yes | Late |
| CIP / NERC compliance | CIP Senior Manager, compliance manager | 1 | 0.8 | CIP-013 supplier risk | Yes | Required for OT-adjacent |
| Security | CISO, OT security lead | 1 | 0.7 | CIP-005, CIP-007 access | Yes | Required |
| IT / OT | IT director, controls engineering | 1–2 | 0.6 | Integration | Yes | Often |
| Regulatory / rates | Regulatory affairs, rate analyst | 0–1 | 0.5 | Rate-case filings | Yes for capex | Mid |
| Procurement | Supply chain manager | 1 | 0.6 | Vendor qualification | Yes | Late |
| Legal | Corporate counsel | 1 | 0.4 | Liability | Yes on terms | Late |
| Board / commission | Board of directors, state PUC, co-op board | 0–1 | 0.6 | Approval of large contracts | Yes | At approval |
| Union | Local union, labor relations | 0–1 | 0.4–0.6 | Job changes | Yes where it applies | Late |

Buyer is not the user for most deals (80% or more) [design].

### Cycle & deal size
Sources are vendor-authored and conflict:
- A 2026 vendor blog says grid infrastructure software takes 6–18 months, compliance and analytics tools 3–9 months, and SCADA/OT modernization 12–36 months. Source: https://www.knowlee.ai/blog/ai-sdr-for-energy-utilities-2026 (unverified marketing estimate).
- EnerNOC's exit from utility engagement software (older Greentech Media piece) notes slow utility sales cycles. Source: https://www.greentechmedia.com/amp/article/enernoc-puts-utility-engagement-software-up-for-sale
- Estimates for small vendors [design]:
  - under $5k: 30–60 days (a small co-op, GM approves)
  - $5–25k: 60–150 days
  - $25–100k: 4–9 months, RFP or competitive quote
  - over $100k: 9–18 months, board or PUC approval
- Typical small-vendor ACV: $10k–$80k [design].
- Win rate: [design] 15–25%; RFP wins are rarer.

### Procurement
- Formal tenders: many utilities use public RFPs. UK water utilities publish SaaS awards on Find a Tender (2025 examples). Source: https://www.find-tender.service.gov.uk/Notice/037099-2025 . US public utilities and co-ops often follow public-procurement rules [design].
- Cooperative contracts: some co-ops and munis buy via a national cooperative purchasing program (e.g., Sourcewell, NASPO ValuePoint) [design]; check the terms before you pitch.
- P-cards: [design] a typical limit is $2k–$5k per transaction at co-ops; IOUs rarely use cards for software.
- Fiscal year: calendar for most IOUs; many co-ops and munis run fiscal years starting July 1 or October 1 [design]. Budgets set in Q3–Q4.
- Rate cases: software spending can be capitalized or expensed (O&M). Recovery depends on the rate case. Regulated IOUs need PUC approval for capex and some contracts [design]; I did not find a source on rate-case treatment of software spending.
- Paperwork: W-9, COI, SOC 2 Type II, a NERC CIP-013 supplier questionnaire for any product that touches BES Cyber Systems, VPAT for public entities, a DPA, background checks for vendor staff with access (CIP-004), and a security incident notice clause.

### Channels
- Works: utility trade groups (APPA for munis, NRECA for co-ops, EEI for IOUs), state association conferences, peer referrals, co-op purchasing programs, and integrations with major platforms (SAP Utilities, Oracle, GIS vendors like Esri).
- Fails: cold email to utility executives; generic AI SDR campaigns (the 2026 SDR blog is itself a sales pitch); trade show booths without a referral.
- Best times: co-op board cycles (monthly), fiscal year-start budget planning in Q2 and Q3 [design]. Avoid storm season and outage season (summer and hurricane season).
- Tech-savviness: low to medium at co-ops; high at IOU IT and OT.

### Methodology
MEDDPICC for anything above $25k, with extra weight on the Paper process (RFP and PUC steps) and Decision criteria (CIP compliance and reliability). Value selling works for small co-ops: quantify the cost of manual work per member. Challenger works for regulatory-risk insights (CIP audit findings). Critical elements: regulatory event as the buying trigger (per vendor blog; treat with caution), CIP compliance evidence, and the economic buyer with board approval.

### Scenarios
1. CIP-013 supplier review is triggered for an OT-adjacent product (~30% for any product touching a BES system) [design]. Handle: produce the supplier risk file early and state scope clearly; if your product does not touch BES Cyber Systems, say so in writing with architecture.
2. Public RFP required above a threshold (~40% above $25k) [design]. Handle: decide quickly whether to bid; if yes, meet the RFP's compliance checklist and references.
3. Rate-case timing delays budget (~20%). Handle: align the start date to the approved capital plan or propose an opex-based pilot.
4. Cooperative contract limits your price (~15%). Handle: check the co-op's terms before proposing.
5. Incumbent renewal (S/4HANA or GIS migration) takes the budget (~25%). Handle: integrate with the incumbent or position as an add-on.
6. Storm or outage crisis freezes projects (~10%). Handle: reschedule and keep the champion warm.

### Common objections
- "CIP-013 says we have to review every supplier." Reply: "Our product is outside BES Cyber Systems. Here is the architecture and the boundary statement; can your CIP Senior Manager confirm?"
- "We need a formal RFP." Reply: "Happy to respond. Which evaluation criteria matter most?"
- "This should go through capital planning." Reply: "What is the capital plan cycle? I can time the proposal to it."
- "We're waiting on the S/4 migration." Reply: "How does our product fit alongside it? Let me show the integration plan."

### Churn & seasonality
- Annual churn: [design] 5–10% for regulated utility software; long renewals (3–5 years) are common.
- NERC CIP-013 revision: NERC posted a draft CIP-013-4 in 2026 (planning timeline targeted Board adoption Oct 7, 2026, but the second ballot window ran to Oct 15, so the date may have slipped). Source: https://www.nerc.com/globalassets/standards/projects/2025-06/formal-posting-1/cip-013-4-standard-clean-final-04282026.pdf ; https://www.fortressinfosec.com/resources/reports/compliance-report-july-2026 . Verify current status with NERC before relying on it. Draft reassessment timing: 24 months for high-impact, 36 months for medium-impact (secondary source).
- Busy: Q2–Q3 for budget planning; Q4 for board approvals. Slow: storm season (summer, hurricane season) and year-end.

### Solo-founder fit: 0.2
Solo founders can sell to small co-ops or munis with a short contract and a non-BES product, but CIP-013 reviews, RFPs and PUC steps need a team and a SOC 2 Type II. Stick to non-OT use cases (customer communications, member portals, billing analytics) and avoid anything connected to operations.

### Sources
- https://www.eia.gov/electricity/annual/html/epa_02_01.html (2026)
- https://www.bls.gov/news.release/archives/union2_02182026.htm (2026)
- https://www.nerc.com/globalassets/standards/projects/2025-06/formal-posting-1/cip-013-4-standard-clean-final-04282026.pdf (2026 draft)
- https://acquia.ladwp.com/sites/default/files/2025-08/CIP-013%20Supply%20Chain%20Cyber%20Security%20Risk%20Management%20Plan%207.0.pdf (2025 example plan)
- https://www.texasre.org/Documents/Presentations/CIPWG/CIPWG%20-%20SCRM1.pdf (Oct 2025)
- https://www.knowlee.ai/blog/ai-sdr-for-energy-utilities-2026 (2026, vendor)
- https://www.greentechmedia.com/amp/article/enernoc-puts-utility-engagement-software-up-for-sale (older)
- https://www.find-tender.service.gov.uk/Notice/037099-2025 (2025)
