# G7 buyer segments: education, nonprofits, churches (research as of 2026-10-14)

Conventions: numbers with a URL and date are sourced. Secondary or vendor-blog figures are flagged "(secondary)". Anything marked [design] is my estimate for the simulator, not a sourced fact. Where sources conflict, both are shown.

---

## Segment A: K-12 school districts

### 1. Size & examples
- US has roughly 13,000 public school districts [design; NCES order of magnitude]. Most are small: the SaaSHero K-12 table uses a "Tier 3" band of under 2,500 students (https://www.saashero.net/strategy/edtech-marketing-school-cycles-2026/, 2026-07-11).
- Example buyers: a rural district of 800 students with 2 schools; a suburban district of 12,000 students with 15 schools and a central office; a charter network of 5 to 20 schools.
- Example vendors in the category: ClassDojo, which joined the NDPA framework in August 2025 and claims "districtwide adoption" as a result (https://www.k12dive.com/press-release/20250814-classdojo-fast-tracks-districtwide-adoption-through-new-privacy-agreement-w/, 2025-08-14, vendor release).

### 2. Buying committee
| Role | Typical titles / count | Influence (0-1) [design] | Main concerns | Can block? | Present |
|---|---|---|---|---|---|
| User | Teachers, 10-100 per district school [design] | 0.3 at school, 0.1 at district | Time, fit to standards, usability | Indirectly (no adoption) | Daily |
| Champion | Instructional coach, curriculum director, tech integrator, principal; 1-3 | 0.6 | Proof of learning, workload | Yes, by withdrawing | Often |
| Economic buyer / signer | Principal (under threshold), superintendent or CAO (above) | 0.8 | Budget line, board risk | Yes | At decision |
| Board of education | 5-9 members; votes above threshold | 0.7 when a vote is needed | Public optics, budget | Yes | At vote |
| Technology / IT | Director of technology, data systems, network admin; 1-3 | 0.7 | SSO (Clever, ClassLink), rostering, security | Yes, hard veto | In most deals |
| Privacy / compliance | Often part-time, sometimes inside IT; 0-1 | 0.6 | NDPA, state exhibits, FERPA, COPPA | Yes | Mid-deal |
| Legal | District counsel or outside firm | 0.4 | Redlines on liability and data | Yes, by delay | Late |
| Purchasing | Purchasing director or buyer | 0.6 | Bid compliance, cooperative use | Yes, by process | Mid to late |
| Finance | Chief business official, business manager | 0.6 | Fund source (general, Title, grant) | Yes | Late |
| Special ed / ELL / other directors | 1 each | 0.3 | Accommodations, language access | Sometimes | Occasional |
| Union / community | Teacher association; public comment | 0.2 | Surveillance, AI, data use | Occasionally, via bargaining or public pressure [design] | Rare |

The buyer is almost never the user. I estimate the signer is a different person in 85-95% of district deals [design]. Teachers can start a deal but rarely close it.

### 3. Cycle & deal size
- EdWeek Research Center survey of 223 leaders, cited secondhand: 37% of purchases took 6-11 months and 22% took 12-17 months, and 78% took six months or longer (https://prospeo.io/s/edtech-go-to-market-strategy, undated; secondary). I could not verify the original.
- Another vendor page cites 12-18 months for K-12 buying cycles (https://www.saashero.net/strategy/edtech-marketing-school-cycles-2026/, 2026-07-11, vendor).
- Ranges by deal size [design, anchored to the above]:
  - Under $5k (school card or principal PO): 14-60 days
  - $5-25k: 60-150 days, may hit a board threshold
  - $25-100k: 150-300 days, board vote likely
  - Over $100k: 9-18 months, bid or RFP likely
- Typical small-district ACV: $4k-35k (SaaSHero table, citing vendor sources; https://www.saashero.net/strategy/edtech-marketing-school-cycles-2026/, 2026-07-11).
- Win rate: about 21% median for B2B SaaS, from Gong 2024 data; no K-12 figure found (https://www.thestarrconspiracy.com/insights/benchmarks/b2b-go-to-market-strategy-benchmarks-2025, 2025).

### 4. Procurement
- P-card: school cards typically carry $1,000-5,000 per-transaction limits [design; not sourced].
- Formal bid thresholds are set by state law, and they vary:
  - California: $114,800 from 2025-01-01 (https://www.lcwlegal.com/news/bid-threshold-increased-to-114800-for-community-college-and-school-district-contracts/, 2025-01-06).
  - New York model policy: competitive bid over $20,000 for supplies, $35,000 for public works; splitting is barred (https://www.niskayunaschools.org/board-of-education/board-policies/board-of-education-policy-5400-purchasing-procurement-of-goods-and-services/, undated).
  - Texas: a 2025 search result reports the threshold raised from $50k to $100k (SB 1173); I could not confirm the primary source.
- Cooperative contracts (state buying groups, Sourcewell, OMNIA, TIPS, BuyBoard) let a district buy without its own bid [design; well known, not re-verified here].
- Fiscal year: 46 states start July 1, and budgets must be final by then. Alabama, Michigan, New York and Texas differ (https://www.ncsl.org/state-legislatures-news/details/almost-all-states-began-new-fiscal-year-with-enacted-budgets, undated, FY2025). California districts must adopt by July 1 (LAO, via search).
- Payment: PO-based, net-30 to net-60 [design].
- Paperwork: W-9, certificate of insurance (cyber coverage increasingly asked for) [design]; security questionnaire (district form, or state template); VPAT for accessibility; SOC 2 Type II for deals over about $25k [design]; the **NDPA** from SDPC. The NDPA has a standard version, state exhibits and vendor-specific variants. One third-party reference says v2.2 was published 2025-11-19 and that the agreement bars selling student data, targeted advertising, and, in recent revisions, training AI models on district data (https://edlaw.eduverse.com/docs/jurisdiction/org/sdpc/ndpa/, undated; secondary). Some districts still run older versions.
- COPPA: the amended FTC rule took effect 2025-06-23 and compliance was due 2026-04-22 (https://www.govinfo.gov/content/pkg/FR-2025-04-22/html/2025-05904.htm, 2025-04-22; https://www.k12dive.com/news/new-coppa-rule-effective-date-2025-ftc/746406/, 2025). The school-authorization exception for edtech was **not** finalized, so vendors still need a path to parental consent or the FTC's edtech policy statement. FERPA also applies, usually through the "school official" exception [design].
- E-Rate: FY2026-30 Category 2 floor is $30,175 and per-student multiplier is $201.57 (https://www.fundsforlearning.com/news/fy2026-2030-e-rate-category-two-funding-adjustments/, 2026). E-Rate covers network and internal connections, so it rarely pays for classroom software [design].
- ESSER: federal pandemic money was obligated by 2024-09-30 and spent through roughly early 2026. The vendor-contract bucket is expected to be cut first (https://www.govtech.com/education/k-12/experts-push-student-focused-budgeting-as-esser-winds-down, 2024-09-06). Edtech Magazine reports the funds are gone (https://edtechmagazine.com/k12/article/2026/08/esser-funds-are-gone-heres-how-k-12-it-leaders-replace-them-perfcon, 2026-08-07). Consolidation is cutting low-usage tools first, while core curriculum, SIS and compliance tools survive (https://civiciq.com/blog/esser-budget-cliff-k12-edtech, date not shown).

### 5. Channels
- Works: free or cheap teacher-level use that converts to a school-level paid pilot; principal-to-principal referrals; state and regional ed-tech conferences and CoSN events [design]; Clever and ClassLink app libraries for SSO and rostering [design]; cooperative contract listings; NDPA listings in state registries.
- Fails: cold outreach to superintendents in August and September (opening season); mass demo requests from teachers with no admin sponsor; large trade-show booths for sub-$50k vendors [design].
- Best times: October to December (planning for next fiscal year), January to March (budget proposals and RFP drafting), May (spend-down). Avoid late August and the last two weeks of June.
- Tech-savviness: IT leaders high; teachers mixed. RAND: 18% of K-12 teachers used AI, and many did so without mandates (https://abcnews4.com/news/nation-world/teachers-trying-out-ai-but-use-of-the-tools-are-on-the-bleeding-edge-in-schools-artificial-intelligence-classrooms-students-ai-virtual-platforms-adaptive-learning-systems-chatbots-rand-corp-research, undated; secondary).

### 6. Methodology
Use MEDDPICC with two extra letters. Track **Process** (board calendar, threshold, bid rule) and **Paper** (NDPA, security form, insurance) from the first call. Champion and economic buyer are the critical elements, because the signer is rarely the user. The EdSurge study of over 225 district decision-makers found that complex behavioral and structural barriers drive decisions (https://edsurge.com/news/2024-06-24-how-district-leaders-make-edtech-purchasing-decisions, 2024-06-24). Bottom-up use is useful as proof of value, but only if you track usage per school and per district so you can see which schools to convert (https://www.reachcapital.com/?p=5667, undated). SPIN fits for teacher discovery; Challenger is too aggressive for a principal who is fearful of privacy risk [design].

### 7. Scenarios
1. **Bottom-up adoption, no admin knows (30%).** Pull usage by school, ask the strongest teacher to send it to the principal, and offer a school-level PO under threshold. Then bring in IT for SSO and rostering.
2. **Deal crosses the board threshold (25%).** Map the board calendar. Build a board packet with the budget line and an endorsing teacher leader. Allow 8-12 weeks.
3. **Privacy review stalls (25%).** Send a pre-filled NDPA with your state exhibit, a data map, and a one-page security summary. Have a SOC 2 report or pen-test letter ready.
4. **Budget cut or consolidation (20% per district in 2026-27) [design].** Position the product as the replacement for a duplicate tool. Offer a one-year term at lower price, or a per-school price that fits under threshold.
5. **Forced RFP (10-15%).** Respond only if the fit is real. Otherwise decline, because RFP scoring rewards breadth.
6. **Champion transfers mid-deal (15%).** Find a second sponsor in the same building and re-run the value case.

### 8. Common objections
- "We don't have budget until July." Reply: "Which line will this come from? If it's next year's, let's get it on the spring agenda now."
- "Our board has to approve anything over $X." Reply: "Let's check the threshold. If we can split into school POs under it, is that acceptable under your policy?" (Do not suggest splitting if policy bars it.)
- "Are you FERPA and COPPA compliant? Do you have our DPA?" Reply: "Here is our NDPA with the state exhibit. Here is our data map and our SOC 2 report."
- "Teachers already use free tools." Reply: "Which parts are used most? We can pilot in the two schools with the most use and show usage data."
- "We're consolidating vendors." Reply: "Which tool do you want to retire? We can take over that workflow."

### 9. Churn & seasonality
- Annual logo churn: 12-20% [design]. Renewals are often not auto-renewals, so each year needs fresh approval. ESSER-era purchases have churned faster since 2025 [design].
- Busy: January-May (budget and purchase orders); July (new spend). Slow: late August (opening), December, summer. The sales-cycle source says roughly 80% of purchases close in May to July (https://www.nationgraph.com/post/timing-is-all-you-need-a-complete-guide-to-k-12-district-budget-cycles-for-edtech-sales-success, undated; secondary).
- As of 2026-10-14, the FY2027-28 cycle is just starting in most districts, so October is a planning window, not a close window [design].

### 10. Solo-founder fit
0.35 [design]. A solo founder can win teacher-led and principal-level deals under threshold. Board deals, NDPA reviews, SOC 2 requests and multi-month cycles strain a 1-3 person team and its cash. Needs 12 months of runway to matter.

### 11. Sources
- https://sdpc.a4l.org/addendums/6602_12409_2026-01-26.pdf (NDPA addendum, 2026-01-26)
- https://edlaw.eduverse.com/docs/jurisdiction/org/sdpc/ndpa/
- https://www.k12dive.com/press-release/20250814-classdojo-fast-tracks-districtwide-adoption-through-new-privacy-agreement-w/ (2025-08-14)
- https://www.govinfo.gov/content/pkg/FR-2025-04-22/html/2025-05904.htm (2025-04-22)
- https://www.k12dive.com/news/new-coppa-rule-effective-date-2025-ftc/746406/
- https://www.govtech.com/education/k-12/experts-push-student-focused-budgeting-as-esser-winds-down (2024-09-06)
- https://edtechmagazine.com/k12/article/2026/08/esser-funds-are-gone-heres-how-k-12-it-leaders-replace-them-perfcon (2026-08-07)
- https://civiciq.com/blog/esser-budget-cliff-k12-edtech
- https://www.ncsl.org/state-legislatures-news/details/almost-all-states-began-new-fiscal-year-with-enacted-budgets
- https://www.lcwlegal.com/news/bid-threshold-increased-to-114800-for-community-college-and-school-district-contracts/ (2025-01-06)
- https://www.niskayunaschools.org/board-of-education/board-policies/board-of-education-policy-5400-purchasing-procurement-of-goods-and-services/
- https://www.fundsforlearning.com/news/fy2026-2030-e-rate-category-two-funding-adjustments/ (2026)
- https://www.saashero.net/strategy/edtech-marketing-school-cycles-2026/ (2026-07-11)
- https://prospeo.io/s/edtech-go-to-market-strategy
- https://www.thestarrconspiracy.com/insights/benchmarks/b2b-go-to-market-strategy-benchmarks-2025 (2025)
- https://www.nationgraph.com/post/timing-is-all-you-need-a-complete-guide-to-k-12-district-budget-cycles-for-edtech-sales-success
- https://edsurge.com/news/2024-06-24-how-district-leaders-make-edtech-purchasing-decisions (2024-06-24)
- https://www.reachcapital.com/?p=5667
- https://abcnews4.com/news/nation-world/teachers-trying-out-ai-but-use-of-the-tools-are-on-the-bleeding-edge-in-schools-artificial-intelligence-classrooms-students-ai-virtual-platforms-adaptive-learning-systems-chatbots-rand-corp-research

---

## Segment B: Colleges and universities

### 1. Size & examples
- Roughly 4,000 degree-granting US institutions [design; NCES order of magnitude]. Typical sizes run from 1,000 students (small private college) to 50,000+ (flagship public) [design].
- Example buyers: a community college with 8,000 students; a regional public with 15,000; a private liberal-arts college with 2,000; an R1 research university with 40,000 students and a separate medical school.
- Fiscal year is typically July to June, though it varies by institution (https://www.getmonetizely.com/articles/when-is-the-best-time-to-buy-edtech-understanding-education-budgets-and-procurement-cycles, undated; secondary).

### 2. Buying committee
| Role | Typical titles / count | Influence [design] | Main concerns | Can block? | Present |
|---|---|---|---|---|---|
| User | Faculty, staff, students; many | 0.4 (faculty), 0.2 (students) | Usability, LMS fit, workload | Indirectly | Daily |
| Champion | Department chair, program director, teaching and learning center director; 1-2 | 0.6 | Pedagogy, student outcomes | Yes, by withdrawing | Often |
| Economic buyer (dept) | Dean or associate dean | 0.7 | Budget, accreditation | Yes | At decision |
| Central IT / CIO | CIO, IT director, enterprise architect | 0.8 | Integration, support load, shadow IT | Yes, hard veto | Most deals |
| Information security | CISO, ISO | 0.8 | HECVAT, SSO, pen tests | Yes, hard veto | Mid-deal |
| Privacy / records | FERPA officer, registrar | 0.6 | FERPA, student records | Yes | Mid-deal |
| Accessibility | Accessibility coordinator | 0.6 | VPAT, WCAG 2.1 AA [design] | Yes | Mid-deal |
| Procurement | Purchasing director, buyer | 0.6 | Bids, sole-source justification | Yes, by process | Mid to late |
| Legal | General counsel, contracts office | 0.5 | Liability, data indemnity, AI terms | Yes, by delay | Late |
| Finance / budget office | Budget director, bursar | 0.5 | Fund source, year-end | Yes | Late |
| Faculty senate / union | Senate committee; grad-student union | 0.2 to 0.4 | AI policy, surveillance, IP | Occasionally [design] | Rare |

Buyer is not the user in roughly 70% of institutional deals [design].

### 3. Cycle & deal size
- SaaSHero estimates 3-9 months for higher-ed purchases with decentralized departmental authority; the page gives no source (https://www.saashero.net/strategy/edtech-marketing-school-cycles-2026/, 2026-07-11, vendor, unsourced figure).
- Another vendor estimates 6-18 months for department-level buying (https://www.getmonetizely.com/articles/when-is-the-best-time-to-buy-edtech-understanding-education-budgets-and-procurement-cycles, undated; secondary).
- Ranges by deal size [design]:
  - Under $5k (department card or PO): 14-45 days
  - $5-25k: 45-120 days
  - $25-100k: 4-8 months, central IT and security review
  - Over $100k: 9-18 months, formal RFP likely
- Typical small-vendor ACV: $3k-25k for department deals [design].
- Win rate: about 21% median B2B SaaS, no higher-ed figure (https://www.thestarrconspiracy.com/insights/benchmarks/b2b-go-to-market-strategy-benchmarks-2025, 2025).

### 4. Procurement
- P-card single-transaction limits vary and are set per card:
  - Arizona State: $10,000 per transaction, $20,000 per month (https://www.asu.edu/purchasing/forms/guide.pdf, Feb 2025)
  - University of Colorado: $5,000 standard, up to $10,000 with approval (https://www.colorado.edu/cmdi/media/7953, Aug 2025)
  - Montclair State: $3,000 base, $10,000 per month (https://inside.montclair.edu/documents/p-card-cardholder-approver-overview, Dec 2025)
  - George Washington: $3,000 threshold for card use; splitting is prohibited (https://procurement.gwu.edu/sites/g/files/zaxdzs4691/files/downloads/ProcurementCardFINAL.pdf, undated)
  - Liberty: $2,500 per transaction (https://www.liberty.edu/finance-admin/procurement/wp-content/uploads/sites/135/P-Card-Policy.pdf, undated)
  - Loyola Marymount: $1,500 per transaction, $20,000 per month (https://finance.lmu.edu/controller/accountspayable/pcard/, undated)
  Many SaaS subscriptions are blocked on P-cards by policy, so check before pricing a monthly plan just under the cap [design].
- Quote and bid thresholds: 3 quotes above about $10k-25k and a formal bid above state limits [design]. Sole-source justification form for anything above that [design].
- Board approval: rarely needed for vendor contracts; the dean or VP can sign [design].
- Payment: PO, net-30 to net-45 [design].
- Paperwork: W-9, certificate of insurance, **HECVAT** (free, from EDUCAUSE, Internet2 and REN-ISAC; the current version is reported as 4.1.5, released 2025-02-10, but sources disagree on numbering, so check EDUCAUSE directly) (https://www.saltycloud.com/blog/what-is-the-hecvat, undated; vendor), VPAT, SOC 2 Type II, DPA, FERPA language, and HIPAA BAA or GLBA/PCI terms when relevant [design].
- Budget timing: departmental budget requests due January or February (https://www.getmonetizely.com/articles/when-is-the-best-time-to-buy-edtech-understanding-education-budgets-and-procurement-cycles, undated; secondary).

### 5. Channels
- Works: EDUCAUSE and similar IT conferences, usually in the fall [design]; faculty champions who present at teaching-center events; peer referrals from other campuses; LTI integrations with Canvas, Blackboard and Brightspace [design]; a published HECVAT sent before the first demo.
- Fails: cold email to provosts or CIOs; generic booths; sales calls during finals or holiday break.
- Best times: September to October (start of fall term), January to March (department budget requests). Avoid December and finals.
- Tech-savviness: IT very high; faculty low to moderate.

### 6. Methodology
MEDDPICC, with security and privacy (HECVAT, FERPA) treated as an early Paper step, not a late hurdle. SPIN for faculty discovery. Value selling for deans, framed around enrollment, retention or accreditation. Critical elements: the HECVAT, the named economic buyer, the fund source, and an LMS integration path.

### 7. Scenarios
1. **Department buys on P-card under limit; central IT blocks later (25%).** Build the HECVAT before selling. Offer a pilot under the department's own budget while the IT review runs.
2. **HECVAT requested mid-deal and you don't have one (30%).** Keep a full HECVAT and a lite version on file. Answer within 5 business days.
3. **LMS integration is required (20%).** Show the LTI path and the admin setup time. If it is not built, say so.
4. **Dean or champion leaves or goes on sabbatical (15%).** Find a second sponsor in the same department, or in the teaching center.
5. **Forced purchasing RFP above a threshold (15%).** Respond only if the fit is real.
6. **Student data used for AI training (20%).** Put a no-training clause in the DPA and show the data-processing map.

### 8. Common objections
- "Do you have a HECVAT?" Reply: "Yes, here it is, last updated [date]. Our security lead can walk through it."
- "We already have a Microsoft or Google tool for this." Reply: "Where does it fall short for your faculty? Let's compare on the three tasks that matter."
- "Does it integrate with Canvas?" Reply: "Yes, via LTI. Here's the setup guide. Your admin can test in a sandbox."
- "Can we pay by P-card?" Reply: "Yes for under $X. Above that we need a PO, and here is our W-9."
- "Our budget closed in February." Reply: "Then let's plan for next year's budget request and pilot this semester on a grant or a small line."

### 9. Churn & seasonality
- Annual logo churn: 8-15% [design]. Renewal often requires a new HECVAT every year, and budget cuts hit departments first [design].
- Busy: January to March (budget), August to September (fall start). Slow: December, finals, summer break.
- As of 2026-10-14, FY2027 requests are being drafted, so October to January is the right window for next-year deals [design].

### 10. Solo-founder fit
0.3 [design]. Department-level deals under $25k fit a solo founder if the HECVAT is done. Central IT, RFPs and multi-month security review do not.

### 11. Sources
- https://www.saltycloud.com/blog/what-is-the-hecvat
- https://www.saashero.net/strategy/edtech-marketing-school-cycles-2026/ (2026-07-11)
- https://www.getmonetizely.com/articles/when-is-the-best-time-to-buy-edtech-understanding-education-budgets-and-procurement-cycles
- https://www.asu.edu/purchasing/forms/guide.pdf (Feb 2025)
- https://www.colorado.edu/cmdi/media/7953 (Aug 2025)
- https://inside.montclair.edu/documents/p-card-cardholder-approver-overview (Dec 2025)
- https://procurement.gwu.edu/sites/g/files/zaxdzs4691/files/downloads/ProcurementCardFINAL.pdf
- https://www.liberty.edu/finance-admin/procurement/wp-content/uploads/sites/135/P-Card-Policy.pdf
- https://finance.lmu.edu/controller/accountspayable/pcard/
- https://www.thestarrconspiracy.com/insights/benchmarks/b2b-go-to-market-strategy-benchmarks-2025 (2025)

---

## Segment C: Nonprofits and associations

### 1. Size & examples
- About 1.5 million US 501(c)(3) organizations [design; IRS order of magnitude]. Most are small, with budgets under $500k [design].
- Example buyers: a food bank with 12 staff and 200 volunteers; a community foundation with 5 staff; a state trade association with 2,000 members; a housing nonprofit with a $3M grant portfolio; a museum with 30 staff.
- Technology spend is low: most nonprofits spend under 3% of budget on tech, and only 13% spend above 5%. For-profit firms average about 6% (https://www.philanthropy.com/news/5-key-findings-from-our-nonprofit-technology-survey/, 2025-06-04; survey of 350+ leaders by Clarion Research).

### 2. Buying committee
| Role | Typical titles / count | Influence [design] | Main concerns | Can block? | Present |
|---|---|---|---|---|---|
| User | Program, development and admin staff; 3-30 | 0.4 | Time saved, ease of use | Indirectly | Daily |
| Champion | Development director, operations manager, executive assistant; 1 | 0.6 | Donor data, reporting | Yes | Often |
| Economic buyer | Executive director; sometimes CFO or COO | 0.8 under board threshold | Cash, mission fit | Yes | At decision |
| Board / finance committee | 7-15 volunteers; treasurer | 0.7 above threshold | Fiduciary duty, conflicts | Yes | At vote |
| Bookkeeper / controller | Outsourced or part-time | 0.5 | Coding, restricted funds | Yes | Late |
| IT / MSP | Outsourced MSP or volunteer tech | 0.5 | Security, integration | Yes, hard veto | Mid-deal |
| Grant compliance | Grants manager or program officer | 0.4 | Funder restrictions | Yes, if a grant restricts the spend | Occasional |
| Legal | Rarely involved | 0.1 | Liability | Rarely | Rare |

The buyer is not the user in about 60% of deals [design].

### 3. Cycle & deal size
- Under $5k: 1-14 days [design].
- $5-25k: 2-8 weeks, may need board sign-off [design].
- $25-100k: 2-4 months, board vote [design].
- Over $100k: 4-9 months [design].
- Typical ACV: $500-$6k per year [design].
- Benchmark context: the SMB median sales cycle across B2B SaaS is 38 days, and 78 days for mid-market (https://knowledgelib.io/business/sales-ops/sales-metrics-benchmarks/2026, 2026; aggregated from Pavilion, Bridge Group and SaaStr data, H2 2024 to H1 2025; secondary). The aggregator figures for segments differ from other sources, so treat them as rough.
- Win rate: about 21% median for B2B SaaS (https://www.thestarrconspiracy.com/insights/benchmarks/b2b-go-to-market-strategy-benchmarks-2025, 2025). Nonprofit-specific rate not found.

### 4. Procurement
- Corporate or P-card: typical limits $1,000-5,000 per transaction [design; not sourced].
- Board approval: set by bylaws, usually a threshold of $5k-25k [design]. Multi-level approval is common, and restricted funds need to be tracked (vendor blog; secondary).
- Donated and discounted products matter a lot. TechSoup's Microsoft offer: Microsoft 365 Business Basic is donated up to 300 licenses per qualifying nonprofit. Business Premium and Office 365 E1 stopped being donated on 2025-07-01 (https://techempower.notion.site/TechSoup-org-The-First-Step-to-Accessing-Technology-Grants-c5368a3c54164ff1920df252144b7457, last verified 2026-05-17; secondary guide). Admin fees run roughly 5-10% of fair market value in some programs (https://www.it-radix.com/?p=22153, undated; secondary; program-specific).
- Google: Workspace for nonprofits is reported as free, and Google Ads grants up to $10,000 per month are reported (https://www.it-radix.com/?p=22153, undated; secondary). I could not confirm current terms on Google's site.
- Grant restrictions: many funders do not fund technology and some restrict grant dollars for software licenses or cybersecurity (https://www.philanthropy.com/news/5-key-findings-from-our-nonprofit-technology-survey/, 2025-06-04).
- Fiscal year: often calendar or July-June [design].
- Paperwork: W-9, 501(c)(3) determination letter, TechSoup verification, COI, DPA if you hold donor or member data [design]. SOC 2 is rarely asked [design].
- Payment: card-first; net-30 for larger invoices [design].

### 5. Channels
- Works: TechSoup listing; peer referrals within the sector; state and regional nonprofit associations; webinars with the exact role (development director, ED); affinity programs and partner-led discounts.
- Fails: paid ads aimed at executive directors (low conversion, design); enterprise-style demos that ask for a card; decks without an impact story.
- Best times: October to December (year-end giving and calendar budgets), January (new budgets), and grant cycle dates [design]. Summer is slow.
- Tech-savviness: low to moderate. Many staff are generalists.

### 6. Methodology
Value selling with an impact frame (hours saved, donors kept, grant reports filed). Light MEDDIC, with **Champion** and **Budget source** as critical elements. Check for restricted funds and a donated-product alternative early.

### 7. Scenarios
1. **ED buys on card; board asks later (25%).** Give the ED a one-page board summary before signing.
2. **Grant restricts software spend (15%).** Check the grant terms first. Offer a general-operating line or a shorter term.
3. **Donated product competes with your paid tier (30%).** Compare total cost, support and migration time. Offer a nonprofit discount you can afford.
4. **No tech champion; volunteer-run IT (25%).** Offer white-glove onboarding or a template setup. Budget the support hours.
5. **Board vote on a quarterly schedule (15%).** Ask for a conditional yes and plan the vote for the next meeting.

### 8. Common objections
- "We get this free from Google or Microsoft." Reply: "Which parts of the free tool are you using today? Here is what we add, and what it costs in staff time."
- "Can you apply a TechSoup or nonprofit discount?" Reply: "Yes, here is our current nonprofit price. Here is the verification step."
- "Our board only meets quarterly." Reply: "We can start with a 60-day trial or a card purchase under your threshold."
- "We can't pay annual upfront." Reply: "Monthly is available at [price]. Annual saves [X]%."
- "Will you still exist in two years?" Reply: "Here is our runway, data export, and a written continuity plan."

### 9. Churn & seasonality
- Annual logo churn: 20-35% [design]. Staff turnover, grant endings and budget cuts drive churn.
- Busy: October to December (year-end giving, budget requests), January. Slow: July to August.
- Renewals often line up with grant cycles and fiscal years [design].

### 10. Solo-founder fit
0.6 [design]. Low price points and card buying suit a solo founder. Churn and price sensitivity make the revenue base fragile.

### 11. Sources
- https://www.philanthropy.com/news/5-key-findings-from-our-nonprofit-technology-survey/ (2025-06-04)
- https://ohiocpa.com/for-the-public/news/2025/06/05/5-key-findings-from-nonprofit-technology-survey (2025-06-05)
- https://techempower.notion.site/TechSoup-org-The-First-Step-to-Accessing-Technology-Grants-c5368a3c54164ff1920df252144b7457 (last verified 2026-05-17)
- https://www.kindora.co/en/in-kind/techsoup-donations-and-discounts-program-techsoup-global
- https://www.it-radix.com/?p=22153
- https://knowledgelib.io/business/sales-ops/sales-metrics-benchmarks/2026 (2026)
- https://www.thestarrconspiracy.com/insights/benchmarks/b2b-go-to-market-strategy-benchmarks-2025 (2025)

---

## Segment D: Churches and religious organizations

### 1. Size & examples
- About 380,000-420,000 US congregations (estimate; https://ministrywatch.com/amp/are-100k-churches-closing-in-america/, undated).
- Median weekly attendance fell from 137 to 65 between 2000 and 2020; about two-thirds of congregations have under 100 people (Faith Communities Today 2020, https://hirr.hartfordinternational.edu/wp-content/uploads/2024/11/A-Portrait-of-the-2020-Faith-Communities-Today-Study-Article-Theology-Today.pdf, Nov 2024 upload; secondary on the two-thirds figure).
- Example buyers: a 60-attendee Baptist church with one part-time admin; a 400-member Catholic parish with a parish finance council; a 2,500-attendee nondenominational church with four campuses and a school; a Lutheran congregation with a preschool.
- Church management software market is projected to add about $418.5M from 2024 to 2029 at 8.9% CAGR (TechNavio via GII Korea, https://m.giikorea.co.kr/report/infi1723022-global-church-management-software-market.html, undated; paid analyst report).

### 2. Buying committee
| Role | Typical titles / count | Influence [design] | Main concerns | Can block? | Present |
|---|---|---|---|---|---|
| User | Ministry leaders, volunteers, staff; many | 0.3 | Time, check-in speed, familiarity | Indirectly | Daily |
| Champion | Church administrator, office manager, business administrator; 1 | 0.7 | Admin load, member data | Yes | Often |
| Economic buyer | Senior pastor; or priest and parish business manager | 0.8 | Ministry fit, cost, trust | Yes | At decision |
| Board / elders / vestry / finance council | 5-12 members | 0.7 above threshold | Stewardship, cost | Yes | At vote |
| Treasurer / finance team | 1-3 volunteers | 0.5 | Giving and payments | Yes, through payments fit | Late |
| Tech volunteer | 0-2 | 0.5 | Integrations, security | Yes, if they own the stack | Mid-deal |
| Children's ministry lead | 1 | 0.5 | Child safety, check-in | Yes | Mid-deal |
| Denomination office | Regional or national staff | 0.4 | Preferred vendors, policy | Sometimes | Rare |

The buyer is not the user in about 60-70% of deals [design].

### 3. Cycle & deal size
- Small church (under $1k per year): 2-6 weeks [design].
- $1-5k per year: 1-3 months [design].
- $5-25k per year (large church or multi-campus): 3-6 months [design].
- Denominational or enterprise: 6-12 months [design].
- Typical ACV: a few hundred to a few thousand dollars per year for a small church [design].
- Win rate: not found.

### 4. Procurement
- No formal RFP for almost all churches [design]. Purchases are often on a personal or church card, with annual payment upfront.
- Approval: pastor for small amounts; board, elders or finance council above a threshold, often $1k-10k [design]. Catholic parishes follow diocesan finance policies [design].
- Fiscal year: calendar year is typical; budgets are often set in November and December and approved at an annual meeting [design].
- Paperwork: rarely W-9. Insurance certificate and child-safety or background-check policies may be asked for in children's ministry [design]. Payment handling: a giving platform (PCI) if you process gifts [design].
- Data: member and child data is sensitive. Expect questions on who can see child records and how data is deleted [design].
- Vendor landscape: Pushpay's 2026 guide says many platforms are quote-based and transaction fees can matter more than subscriptions as giving grows (https://pushpay.com/blog/best-church-management-software-for-2026/, 2026; vendor-authored).

### 5. Channels
- Works: pastor and admin peer networks; denominational events and regional gatherings; church-tech podcasts and Facebook or Reddit groups for church administrators [design]; integrations or app listings inside existing church platforms [design]; referrals from consultants.
- Fails: cold email to pastors; enterprise sales motions; ads that target "pastor" [design].
- Best times: January to February (new budgets and new year), August to September (fall program launch). Avoid Holy Week and Christmas. Summer is slow.
- Tech-savviness: admins moderate to high; pastors low. Pushpay's 2025 study of 1,700+ church leaders found that support and implementation guidance grew in importance versus price (https://www.religionunplugged.com/news/2025/4/30/new-study-reveals-key-tech-trends-shaping-the-us-church, 2025-04-30; vendor-linked study, secondary).

### 6. Methodology
Value selling tied to ministry outcomes (volunteers placed, first-time guests followed up, giving processed). Light SPIN for discovery. Keep it simple: a full MEDDIC process is too heavy for a church. Critical elements: the admin as champion, a named budget owner, and a clear answer on child-data handling.

### 7. Scenarios
1. **Pastor says yes; admin says "we've used X for ten years" (30%).** Offer a migration service and a parallel run.
2. **Elder or finance board must vote (20%).** Prepare a one-page summary with cost per member and a 90-day trial.
3. **Child-safety or data concern (15%).** Show your data access controls and deletion process. Offer a signed data processing addendum.
4. **Staff turnover (20%).** Document setup so a new admin can run it. Keep a single named contact.
5. **Denomination requires a preferred vendor (10%).** Check the denominational list early. If you are not on it, decline gracefully.
6. **Giving or payments bundle required (20%).** Show how your product works with the giving platform, or add a referral.

### 8. Common objections
- "We're already on [big church platform]." Reply: "What's missing? Here's the one feature we handle better, with the switching plan."
- "We don't have budget until January." Reply: "Then let's start the pilot in January and sign the annual plan then."
- "Is our member and children's data secure?" Reply: "Here is our access model, encryption, and deletion policy. Here is our DPA."
- "Our volunteers do it manually and it's fine." Reply: "How many hours a week does that take? Let's measure it for two weeks."
- "The board needs to see it first." Reply: "Here is a one-page summary and a 60-day trial they can approve as a single line item."

### 9. Churn & seasonality
- Annual logo churn: 15-25% [design]. Small churches close or merge, and staff turnover drives churn.
- Busy: January to February, August to September. Slow: December, summer.
- Renewals often lapse when a budget is cut in the annual meeting [design].

### 10. Solo-founder fit
0.7 [design]. Low-touch, self-serve products with simple pricing fit a solo founder. Anything needing denominational approval or heavy onboarding does not.

### 11. Sources
- https://ministrywatch.com/amp/are-100k-churches-closing-in-america/
- https://hirr.hartfordinternational.edu/wp-content/uploads/2024/11/A-Portrait-of-the-2020-Faith-Communities-Today-Study-Article-Theology-Today.pdf
- https://m.giikorea.co.kr/report/infi1723022-global-church-management-software-market.html
- https://pushpay.com/blog/best-church-management-software-for-2026/ (2026)
- https://www.religionunplugged.com/news/2025/4/30/new-study-reveals-key-tech-trends-shaping-the-us-church (2025-04-30)
- https://churchexecutive.com/archives/state-of-church-technology-report
