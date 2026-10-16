# Public-sector RFPs: research notes (2023-2026)

Scope: US city/county/state government, K-12, higher ed; brief UK/EU notes. Sourced facts are linked. [unverified] marks anything I could not confirm. [design] marks game assumptions, not statistics. Searches found few public-sector-specific win-rate or hours figures, so those gaps are stated explicitly.

## 1. Lifecycle and durations

Typical stages: sources-sought/RFI, RFP issue, pre-proposal conference, written Q&A and addenda, submission deadline, evaluation, shortlist/demos/orals, BAFO, notice of intent to award, protest window, contract negotiation, board/council approval, PO.

- Long Beach, CA city process chart: review 2-4 weeks, issuance 4-5 weeks, evaluation 2-4 weeks, approval 1-4 weeks, a 5-day protest period, award 1-2 days. [Long Beach process chart](https://www.longbeach.gov/globalassets/edo/talent--workforce/policies/procurement-of-equipment/rfp-process-flow-chart-2016) (dated 2016 file name, use as directional)
- Hawaii 2026 state licensing RFP: about 14 weeks from advertisement to notice of award. Questions closed July 1, answers about two weeks later. [Hawaii addendum 2026](https://hiepro.ehawaii.gov/resources/188284/20260708_ADDENDUM%20NO2_FINAL.pdf)
- Portland Public Schools guidance: about 3 business days from last question date to final addendum, and at least 5 calendar days from final addendum to proposals due. [PPS formal solicitation timeline](https://www.pps.net/cms/lib/OR01913224/Centricity/Domain/73/RFP%20Formal%20Solicitation%20Minimal%20Timeline%20v1%20062413.doc) (older document, directional)
- BAFOs are a short, optional late step. Hawaii put them about 3 weeks after proposals opened. A North Carolina health plan RFP ran BAFOs for about two weeks (Nov 2022). North Dakota uses them only when proposals are unclear.
- Sacramento airport RFP: issued June 2025, anticipated effective agreement November 1, 2025, about 5 months. [Sacramento timeline](https://sacramento.aero/assets/pdf/attachment-1---xiii.-rfp-timeline-update.pdf)
- New Mexico protest window: 15 calendar days after award. [NM sequence of events](https://www.env.nm.gov/wp-content/uploads/2020/01/RFP-Updated-Sequence-of-Events.pdf)
- **Working estimate: 3-6 months from issue to award, plus 1-3 months to a signed contract and board approval. [design]** Board or council approval adds a fixed meeting cycle that can slip a month.

UK (Procurement Act 2023, in force Feb 2025):
- Mandatory standstill is 8 working days from publication of the contract award notice (was 10 calendar days under the old PCR regime). [Bevan Brittan](https://bevanbrittan.com/expertise/services/procurement-litigation/standstill-debriefing), [Knights 2026](https://www.knightsplc.com/briefings/2026/the-procurement-act-2023-key-considerations-in-2026-for-suppliers-where-contracts-with-the-public-sector-are-coming-up-for-retender/)
- Thresholds reduced 1 Jan 2026, incl. VAT: £135,018 central government goods/services; £207,720 sub-central authorities; £415,440 utilities; £5,193,000 works/concessions. Light Touch Regime £663,540. [Knights 2026](https://www.knightsplc.com/briefings/2026/the-procurement-act-2023-key-considerations-in-2026-for-suppliers-where-contracts-with-the-public-sector-are-coming-up-for-retender/) (the Tussell page still shows 2024 figures)
- I could not confirm the "15-day debrief request" window. [unverified]

EU: above-threshold notices are published on TED. Germany alone had about 166,000 above-threshold notices in 2025 (ForgentAI analysis, which excludes below-threshold buys). [ForgentAI](https://www.forgent.ai/blog/oeffentliche-vergabe-deutschland-marktbericht-2025)

## 2. What a response contains

Typical package (verify against each RFP's instructions):
- Cover letter signed by an authorized officer.
- Mandatory forms: W-9, insurance certificates, non-collusion affidavit, debarment/suspension certification, conflict-of-interest disclosure, addenda acknowledgements. Federal-style forms like SF 1440 show up in some agencies.
- Compliance matrix mapping every "shall" requirement to a response section.
- Functional/technical response, implementation plan, staffing, references.
- Pricing form (often a fixed template; altering it can disqualify).
- Security questionnaires: for K-12 and higher ed, HECVAT (free, self-assessed, not a certification; HECVAT 4 is the current version) and/or a SOC 2 Type II report. Kean University asks for a SOC 2 Type II (preferred) or a HECVAT Lite/Full. [Salty Cloud HECVAT vs SOC 2](https://www.saltycloud.com/blog/hecvat-vs-soc-2/), [Kean](https://helpdesk.kean.edu/support/solutions/articles/15000127208-requesting-a-soc-2-type-ii-report-or-hecvat-questionnaire)
- VPAT / accessibility conformance report: commonly required; I found no sourced K-12 specifics. [unverified]
- Student-data privacy agreements (state DPAs/NDPAs, FERPA) for K-12. [unverified specifics per state]
- Insurance minimums (cyber, E&O, general liability) typically set in the RFP; amounts vary widely by buyer. [unverified]
- Bid or performance bonds: rare for SaaS, more common for construction or large services. [design]

HECVAT effort: one vendor guide estimates 8-20 hours for the workbook. [Salty Cloud HECVAT compliance](https://www.saltycloud.com/blog/hecvat-compliance/) (vendor source)

## 3. Evaluation and disqualification

- Typical scoring: technical/functional ~40-70%, price ~15-35%, experience/references ~10-20%, local or small-business preference points where the code allows. [unverified ranges; check each RFP's evaluation section]
- Pass/fail mandatory requirements are scored separately; failing one removes the response before scoring.
- Disqualification: Euna Procurement analyzed over 6,000 public RFPs and found about 15% of submissions disqualified in 2014, falling to about 4% by 2018. [Euna](https://eunasolutions.com/resources/vendor-disqualifications-why-they-happen-and-what-you-can-do-about-it/) (dated; trend, not current)
- Common causes: late submission (often rejected even by minutes), unsigned or missing forms, ignored page limits or format, unaddressed mandatory criteria. [Flowcase](https://www.flowcase.com/blog/reasons-proposals-get-disqualified) (vendor blog)
- Practical rule: the compliance check takes an hour and removes the most common loss. [design]

## 4. "Wired" RFPs and win rates

- No rigorous public data found on win rates for pre-engaged vs cold vendors in government.
- Vendor claims (unaudited, marketing): a state-government proposal team said its win rate rose from 25% to more than 80% after selecting fewer bids; [RFP Success podcast](https://www.therfpsuccesscompany.com/podcasts/80-win-rates-in-state-government-rfps-part-1-with-steve-schramm). Another firm claims incumbents win because most awards are effectively shaped 12-18 months before posting. [Civiciq](https://civiciq.com/blog/how-incumbents-win-government-contracts) (vendor-side argument)
- Cross-industry, not public sector: Loopio's survey of 1,500+ teams put average RFP win rate at 45% (2025), up from 43% in 2024. [Loopio](https://loopio.com/?p=189202)
- Older GovLoop data (2018-2019): average 18 RFPs per year per public organization and about five submissions per municipal RFP. [GovLoop](https://www.govloop.com/10-stats-government-should-know-on-the-state-of-the-rfp/)
- Incumbent re-bids usually win more often than new-vendor bids; no sourced percentage found. [unverified]
- Gap: APMP or GovSpend data on pre-issue engagement was not found.

## 5. Cooperative contracts and thresholds

Cooperative purchasing (Sourcewell, OMNIA Partners, TIPS, NASPO ValuePoint, state contracts, GSA Schedule): a lead agency competes once, then member agencies buy off the contract without their own bid. Eligibility and the buyer's local rules still apply.
- OMNIA sells its contracts as already competitively solicited. Sourcewell (formerly NJPA) is a lead agency for some OMNIA contracts. [OMNIA](https://www.omniapartners.com/resources/blog/skip-the-bid-with-omnia-partners) (marketing)
- Sourcewell purchases skew toward fleet and heavy equipment; OMNIA toward facilities and IT (one 2026 comparison, small sample). [Civiciq vs](https://civiciq.com/blog/sourcewell-vs-omnia-partners)
- Fees: NASPO ValuePoint administrative fee is 0.25% of sales on many state contracts, paid by the vendor. [Santa Ana NASPO attachment](https://publicdocs.santa-ana.org/WebLink/1/doc/140312/Page10.aspx), [NASPO FAQ](https://naspovaluepoint.org/faq/is-there-a-membership-fee-or-a-fee-to-use-a-valuepoint-contract/). A state participating addendum can add a fee. Sourcewell and OMNIA fees could not be confirmed; one city document shows a vendor proposing 1.00% on a Sourcewell contract. [unverified]
- Design: a cooperative contract is a listing, not a sale. Budget for the fee, the catalog and price-file work, and a sales push. [design]

Federal thresholds (FAR, effective Oct 1, 2025):
- Micro-purchase: $15,000 (was $10,000). [GSA SmartPay bulletin](https://smartpay.gsa.gov/guidance-and-audits/smart-bulletins/002/)
- Simplified acquisition threshold: $350,000 (was $250,000). Simplified procedures apply to the maximum extent practicable. [FAR 13.003](https://www.acquisition.gov/far/13.003)
- Grant recipients under 2 CFR 200 may set a higher threshold, up to $50,000. [fedbizaccess](https://fedbizaccess.com/key-dollar-thresholds-jump-on-october-1/)

State and local (examples, verify statute):
- Arizona counties: sealed competitive bids above $10,000 per transaction (excluding professional services). [ARS 11-254.01](https://codes.findlaw.com/az/title-11-counties/az-rev-st-sect-11-254-01/)
- Tennessee counties can raise the sealed-bid threshold to $50,000 by resolution; three written quotes below it. [CTAS](https://ctas.tennessee.edu/node/103874/printable/pdf)
- Texas counties: competitive bidding threshold raised from $50,000 to $100,000, effective Sept 1, 2025 (SB 1173). [Legiplex](https://app.legiplex.com/tx/legislature/2025/89-r/bills/hb4069) (bill page; check final status)
- Typical pattern [unverified]: micro-buy with no quotes; informal quotes (2-3) in a middle band; formal sealed bid or RFP above the state's threshold. K-12 districts often use their own thresholds set by board policy.

## 6. Debriefs and protests

- US federal (FAR 15.505): a preaward debrief request must be in writing within 3 days of the exclusion notice, or it is not "required." [acquisition.gov](https://www.acquisition.gov/far/15.505) Deadlines are strict: a request at 5:24 pm on day three was held late in GAO's *Exceptional Software Strategies* (B-416232), since agency close of business is presumed 4:30 pm local time. [Wiley](https://www.wiley.law/newsletter-Summer-School-Recent-Bid-Protest-Decisions-on-Timing-Issues-That-Business-Teams-and-In-House-Counsel-Need-to-Know)
- Protest to GAO: within 10 days of knowing the basis, or 10 days after a required debrief. [Wiley](https://www.wiley.law/article-11019)
- State and local protests: often 5-15 days after notice of award (see Long Beach and New Mexico above). Rules vary.
- GAO FY2025 (released Dec 2025): 1,688 filings (down from 1,803); sustain rate 14% of merits decisions (down from 16%); some relief obtained in 52% of cases, including voluntary corrective action. [Crowell](https://www.crowell.com/en/insights/client-alerts/2025-gao-bid-protest-annual-report-where-have-all-the-protests-gone), [Jenner](https://www.jenner.com/en/news-insights/client-alerts/annual-gao-bid-protest-statistics-filings-down-but-relief-rate-steady). Filing counts differ slightly across firms, so use the GAO report.
- Protests are rare for a small vendor and expensive; most losers get a debrief and move on. [design]
- For a game: a losing bid can file a protest with a 14% base sustain rate, so it wins only when the evaluation has a real flaw. [design]

## 7. Effort and go/no-go

- Hours to write a public RFP response for a small vendor: no sourced figure found. [unverified]. [design] working range for a small SaaS: 20-60 hours for a standard RFP, 80-150+ for a large one with a security questionnaire and demo.
- HECVAT workbook alone: 8-20 hours (vendor estimate). [Salty Cloud](https://www.saltycloud.com/blog/hecvat-compliance/)
- Go/no-go criteria used by good bid teams [design, from practitioner norms]:
  - You have a named champion who helped shape or knows the requirements.
  - Your product meets roughly 80%+ of mandatory and must-have criteria without custom build.
  - You can meet the security documents (SOC 2 or HECVAT, VPAT, insurance) on the due date.
  - Price fits the buyer's budget and any cooperative price file.
  - The incumbent is not clearly locked in, or the contract is up for re-bid in a known window.
  - Hours to bid are below the expected value (win probability x first-year contract value).
  - Compliance check passes: forms, format, page limits, deadline noted with a 4:30 pm buffer.
