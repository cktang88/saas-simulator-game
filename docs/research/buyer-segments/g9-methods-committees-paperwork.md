# G9: Sales methods, buying committees, vendor paperwork (research as of 2026-10-14)

Conventions: every number has a URL and date. [design] = my estimate, not sourced. [unverified] = appears only in secondary or vendor sources that I could not trace to a primary report. Where a primary source could not be fetched, the source is named as a search summary.

## A. Sales methodologies

Only MEDDPICC was checked against 2024-2026 sources in this pass. The other methods are summarized from standard practice and carry no numbers, so verify before quoting them.

**MEDDIC / MEDDPICC.** Eight elements in MEDDPICC: Metrics, Economic buyer, Decision criteria, Decision process, Paper process, Identify pain, Champion, Competition. MEDDIC is the same without Paper process. Sources: [scratchpad.com/blog/meddpicc](https://scratchpad.com/blog/meddpicc) and [exec.com/learn/meddpicc-the-complete-guide](https://www.exec.com/learn/meddpicc-the-complete-guide) (both 2024-2026 vendor explainers). Origin at PTC in the 1990s is noted in the same vendor material.
- Metrics: the quantified business outcome the buyer wants. Probe: "If this works, what number moves, and by how much, by when?"
- Economic buyer: the person who can release budget and say yes alone. Probe: "If you and the team agree, what else is needed to sign? Who signs?"
- Decision criteria: the requirements the buyer will score against. Probe: "What must the solution do to be shortlisted? What would make you drop a vendor?"
- Decision process: the steps and people between now and signature. Probe: "Walk me through the last software purchase you made here, step by step."
- Paper process: security review, legal, procurement, order form. Probe: "What do security, legal and procurement need from us, and how long does each take?"
- Identify pain: the problem, with a cost attached. Probe: "What does this cost you per month today?"
- Champion: an internal person with power and a personal stake. Test: would they sell for you when you are not in the room?
- Competition: including the status quo and an internal build. Probe: "What happens if you do nothing for another year?"
- Use it for: deals above roughly $25k ACV or with a procurement step (design, based on the vendor material's "complex deals" framing).
- Common mistakes: scoring a deal "qualified" with no economic buyer; treating a friendly user as champion; leaving Paper process until the last week; checking boxes without dated evidence.
- What a call transcript can reveal: Pain (stated cost), Decision criteria (named requirements), Decision process (steps mentioned), Paper process (security or legal mentioned), Competition (named vendors or "we'll build it"), and Champion behavior (does the contact offer introductions or internal selling). Economic buyer and Metrics are often only partly visible; they need a follow-up. Budget and signature authority usually cannot be confirmed from the call.

**BANT (Budget, Authority, Need, Timeline).** Older and simpler, and it ignores the buying group. Use for low-ACV, single-decision-maker deals (design). Mistake: treating "authority" as the only buyer. Transcript: budget and timeline are often stated; authority usually is not.

**SPIN Selling.** Situation, Problem, Implication, Need-payoff questions. Best for complex consultative sales where the seller must build the problem's size (design). Mistake: running long situation questions and skipping implication. Transcript: problem and implication questions are visible; need-payoff answers show the buyer's own value statement.

**Challenger.** Teach, tailor, take control. Best for markets where buyers do not know they have a problem worth solving (design). Mistake: "teaching" without a buyer-specific insight, or a challenge that feels hostile. Transcript: whether the rep offers a new view and whether the buyer engages with it.

**Sandler.** Up-front contracts, pain funnel, negative reverse selling, and a "decision" close. Good for outbound-heavy mid-market sales (design). Mistake: using negative reverse on prospects who want to be sold. Transcript: contracts for next steps, and whether the buyer agrees to a stated outcome.

**Value selling and Command of the Message.** Map the buyer's business case to measurable outcomes, and organize the story around a single value narrative (design). Mistake: a value calculator the buyer never validated. Transcript: whether buyers repeat the numbers back.

**Gap selling.** Compare current state to future state and sell the gap. Works for process or workflow tools (design). Mistake: a "future state" the buyer never described. Transcript: current and desired state statements.

**Solution selling.** The rep diagnoses the problem first, then fits the product. Works for technical products (design). Mistake: demoing before diagnosis. Transcript: demo start time relative to discovery.

## B. Buying groups, no-decision losses and multi-threading

**Buying group size.**
- Gartner (2025 press release on a June 2025 survey of 632 buyers, fielded Aug-Sep 2024): groups range from five to 16 people across as many as four functions, per Gartner's Kirkwood. Source: [gartner.com, 2025-05-07 press release on unhealthy conflict](https://www.gartner.com/en/newsroom/press-releases/2025-05-07-gartner-sales-survey-finds-74-percent-of-b2b-buyer-teams-demonstrate-unhealthy-conflict-during-the-decision-process).
- Gartner "6 to 10" buyers: cited on Gartner slides and in secondary 2025 benchmark pages (Starr Conspiracy attributes it to Gartner 2024). I did not find a Gartner primary page. [unverified]
- Forrester (2025 Buyers' Journey survey, reported in *The State of Business Buying, 2026*, [forrester.com/report/the-state-of-business-buying-2026/RES186878](https://www.forrester.com/report/the-state-of-business-buying-2026/RES186878), 2026): average 13 internal stakeholders and nine external participants per B2B purchase. When a purchase includes generative AI features, the buying group roughly doubles.
- Forrester by deal size: I did not find a primary breakdown. Starr Conspiracy's 2025 benchmark page ([thestarrconspiracy.com/insights/benchmarks/b2b-buying-committee-benchmarks-2025](https://www.thestarrconspiracy.com/insights/benchmarks/b2b-buying-committee-benchmarks-2025)) gives SMB 3.1, mid-market 6.8, enterprise 11.2 people, and attributes these to Forrester 2024 by company size, not deal value. Another instance of the same site gives 14-23 for deals above $1M, attributed to Forrester 2023. These conflict. [unverified]

**Consensus.** Gartner (2025-05-07 release, above): 74% of buyer teams show "unhealthy conflict"; teams reaching consensus are 2.5 times more likely to rate the deal high quality. Group-relevant content raised consensus by 20% and individual-level content lowered it by 59% (index 1-11 and 1-12 of the same release).

**Rep-free preference.**
- Gartner press release, 2025-06-25: 61% of B2B buyers prefer an overall rep-free experience (survey of 632 buyers, Aug-Sep 2024). 73% avoid suppliers whose outreach seems irrelevant. 69% report inconsistencies between the seller's website and what sellers say. Buyers still want seller input for context-dependent tasks such as fit assessment. Source: [gartner.com/en/newsroom/press-releases/2025-06-25-gartner-sales-survey-finds-61-percent-of-b2b-buyers-prefer-a-rep-free-buying-experience](https://gartner.com/en/newsroom/press-releases/2025-06-25-gartner-sales-survey-finds-61-percent-of-b2b-buyers-prefer-a-rep-free-buying-experience).
- A later Gartner survey (646 buyers, Aug-Sep 2025), reported March 2026 by Digital Commerce 360 ([digitalcommerce360.com/2026/03/17/gartner-b2b-buyers-rep-free-purchasing-ai-reshapes-sales/amp/](https://www.digitalcommerce360.com/2026/03/17/gartner-b2b-buyers-rep-free-purchasing-ai-reshapes-sales/amp/)), gives 67%. Secondary report.
- Gartner "17% of buyer time with suppliers": cited in secondary 2024-2025 pages, possibly from older Gartner material. [unverified]

**6sense buyer experience reports.**
- 2024 report: buyers complete about 70% of the journey before engaging sellers. Secondary citation. [unverified as primary]
- 2025 report (press release dated 2025-11-12, [businesswire.com/news/home/20251112018032/en](https://www.businesswire.com/news/home/20251112018032/en)): the independent-research versus seller-engagement split moved from 70/30 to 60/40; average first seller contact at 61% of the buying process, down from 69% in earlier studies; buying cycle shortened from about 11 months to 10; the vendor a buyer prefers before sales contact wins about 80% of deals. I could not fetch the release (HTTP 403), so these figures come from search summaries. [unverified: confirm on the release]
- UK and Ireland cut: 57% of journey before vendor contact versus 61% globally (MarketOne, [marketone.com/b2b-buyer-study-25](https://www.marketone.com/b2b-buyer-study-25), 2025). Secondary summary.
- Shortlist: 6sense's 2025 finding that the preferred vendor before contact wins about 80% of deals is the basis for the "shortlist forms early" point. Treat as directional.

**Deals dying from "no decision."** No verified primary figure. Secondary claims conflict:
- About 40% of B2B buying journeys end in no decision, attributed to Gartner (Mediafly, undated). [unverified]
- "Roughly half" of qualified opportunities, attributed to Gartner without a report (Boomerang, undated). [unverified]
- 59% of purchase processes end in no decision, attributed to Forrester (Sproutworth, undated). [unverified]
- About 40% of considered deals abandoned for lack of group agreement, citing a LinkedIn and Bain study (CB News, France, [cbnews.fr/node/99404](https://www.cbnews.fr/node/99404), undated). [unverified]
- Planning range I would use: 40-50% of qualified deals end without a purchase, and the no-decision share is the largest loss reason in many B2B funnels. [design]

**Multi-threading (Gong).**
- Gong Labs analysis of about 1.8 million new-business opportunities closed in 2024 (reported 2025 via secondary summaries): multithreaded deals over $50K show about a 130% win-rate lift; closed-won deals show 67% more buyer contacts than closed-lost deals; won deals average 6.7 selling-team members by end of discovery. Sources: [webtonic.io/blog/account-based-selling-statistics](https://www.webtonic.io/blog/account-based-selling-statistics) (secondary); Gong's own guide [gong.io/resources/guides/the-data-backed-guide-to-multi-threading-and-team-selling](https://www.gong.io/resources/guides/the-data-backed-guide-to-multi-threading-and-team-selling). Some summaries say "roughly twice" the contacts; that conflicts with 67%. [unverified]
- Gong blog (2026, [gong.io/blog/when-and-how-to-multi-thread-when-selling-to-executives](https://www.gong.io/blog/when-and-how-to-multi-thread-when-selling-to-executives)): a won $50K-$250K deal typically involves at least 10 stakeholders. Won deals have at least three buyer participants in meetings; lost opportunities often have one. Associations, not causal effects.
- Older Gong data (2022): a 55% increase in won deals involving a VP-or-higher in a sales meeting. [unverified as current]
- Three-times multiplier: repeated on many blogs, attributed to Gong, with no primary source found. Do not quote.

**Champion turnover and losing a champion.** No verified study found.
- GrowthSpree claims 8% of churn comes from "champion change," with an unknown source. [unverified]
- Claims that 73% of champions fail to close deals (Sales Reality Check) have no traceable source. Do not quote.
- Planning assumption: treat a champion departure as a material risk in any deal lasting more than about 90 days, and track "second champion named" as a leading indicator. [design]

## C. Vendor paperwork for a small vendor

Costs and times below are from 2025-2026 vendor and consultant pages unless marked. Hours are mostly [design].

**SOC 2 platform (Vanta, Drata).**
- Startup-tier platform pricing: roughly $7,500-$15,000 per year for Drata under 50 employees, SOC 2 only; a reseller quotes Vanta at $7,200 per year for 1-20 employees; another guide puts Vanta at $10,000-$12,000 for a single framework. Sources: [petronellatech.com/blog/soc-2-compliance-cost-in-2026-what-startups-actually-pay](https://petronellatech.com/blog/soc-2-compliance-cost-in-2026-what-startups-actually-pay), [costbench.com/compare/drata-vs-vanta/](https://www.costbench.com/compare/drata-vs-vanta/), [tracelayer.it.com/blog/soc2-compliance-cost-2026](https://tracelayer.it.com/blog/soc2-compliance-cost-2026) (dated 2026-03-20). Quoted prices vary by vendor and are negotiated.
- Implementation fee: $5,000-$20,000 in year one (one guide), $10,000-$25,000 (another). Renewal increases of 20-30% in year two are reported. [unverified; vendor guides]
- Time for the internal owner: about 5-8 hours per week for 6-10 weeks to the first Type I. Source: petronellatech (above). [unverified]

**SOC 2 audit fees.**
- Type I auditor: about $5,000-$25,000 (Startup Defense, [startupdefense.io/soc-2-costs-for-startups-complete-breakdown-and-budget-guide](https://www.startupdefense.io/soc-2-costs-for-startups-complete-breakdown-and-budget-guide); Scrut, [scrut.io/hub/soc-2/cost-of-soc-2-audit](https://www.scrut.io/hub/soc-2/cost-of-soc-2-audit), 2025).
- Type II auditor: $15,000-$50,000 (Startup Defense); $7,000-$100,000 in another guide. Total Type II program $30,000-$80,000 (Startup Defense).
- Observation window: at least three months; six months is common for a first audit; 12 months adds 30-50% to audit fees versus three months (one vendor's estimate). [unverified]
- Total first-year budget: $40,000-$95,000 including platform, audit and tooling (petronellatech). [unverified]
- Calendar: Type I roughly 3-4 months from kickoff including preparation; readiness (gap assessment and fixes) 4-8 weeks in typical cases, from 2 weeks to 9 months in the range given. Type II total 6-12 months. Sources: [wolfia.com/blog/soc-2-compliance-requirements-complete-guide](https://wolfia.com/blog/soc-2-compliance-requirements-complete-guide) (March 2026). [design] for the hours below: policies and evidence setup 60-120 hours for the founder or one ops person in the first 3 months; ongoing evidence about 2-4 hours per week.

**Penetration test (web app and API).**
- Small SaaS: $5,000-$30,000. Tight single-app scope $5,000-$10,000; SaaS with web and API $15,000-$35,000 (Autonoma, [getautonoma.com/blog/penetration-testing-cost](https://getautonoma.com/blog/penetration-testing-cost), 2026). Hourly rates $200-$350 (Kualitatem, [kualitatem.com/blog/penetration-testing/how-much-does-penetration-testing-cost/](https://www.kualitatem.com/blog/penetration-testing/how-much-does-penetration-testing-cost/)). Astra and Blaze InfoSec 2026 pages give $5,000-$30,000.
- Calendar: 1-3 weeks of testing elapsed (Blaze InfoSec, [blazeinfosec.com/post/how-much-does-penetration-testing-cost/](https://www.blazeinfosec.com/post/how-much-does-penetration-testing-cost/)); add 2-6 weeks to book and to remediate and retest. [design]
- Founder hours: 4-10 hours for scoping, access and reading the report; 10-40 hours of remediation for a small app. [design]

**Security questionnaires (SIG Lite, CAIQ, custom).**
- Overall effort: 12-18 hours across teams for an average questionnaire (Wolfia, 2025-2026); 20-40 hours manual for a vendor security assessment (Secureframe 2025, cited by Tribble). Vendor sources, [unverified].
- SIG Lite: about 200 questions. CAIQ (full): about 260-300 yes/no questions. [unverified: vendor descriptions]
- My planning numbers [design]: first SIG Lite 12-20 hours; repeat SIG Lite with a trust center or SOC 2 report and an answer library 2-4 hours; CAIQ first time 8-16 hours. Calendar: 5-10 business days is the typical buyer deadline; one vendor says deals slip when answers take more than 5 business days, with no source.

**HECVAT (higher ed).**
- Review turnaround quoted by universities: 5-10 business days (Montclair State, [inside.montclair.edu/administration/information-technology-division/information-security/vendor-assessment-hecvat](https://inside.montclair.edu/administration/information-technology-division/information-security/vendor-assessment-hecvat)); 4-12 weeks for full assessments (Toledo, [utoledo.edu/it/security/assessments](https://www.utoledo.edu/it/security/assessments)); 4-6 weeks for a Security Assessment Review (USNH, [td.usnh.edu](https://td.usnh.edu/TDClient/60/Portal/KB/Article/689/Vendor-Information-Security-and-Privacy-Considerations-and-Security-Assessment-Review-SAR)).
- Hours to complete: not found. [design] Full HECVAT first time 15-30 hours; Lite 6-12 hours; then reuse for other schools. A completed HECVAT is reusable across schools.

**VPAT / ACR (Section 508, WCAG).**
- Engagement to delivery: 4-8 weeks for an outside accessibility firm (accessible.org, [accessible.org/vpat-process-request-acr/](https://accessible.org/vpat-process-request-acr/)). One firm quotes $350 for a WCAG-edition ACR plus the audit fee. [unverified]
- Standard: buyers typically ask for WCAG 2.1 AA in 2025 (a firm's own 2025 request mix). Texas guidance requires WCAG 2.1 AA for state software by April 24, 2026 (Texas university page; verify). Confirm which edition the buyer wants before you start.
- Hours [design]: 20-60 internal hours for an ACR on a 10-30 screen app, plus remediation time that can run 40-120 hours if the audit finds many failures.

**HIPAA BAA.**
- Required before any PHI goes to a covered-entity customer. No turnaround data found. [design] 1-2 weeks for a clean BAA from your template; 4-12 weeks if the customer's BAA is used and negotiated.
- Enforcement example from a vendor blog: a medical center paid $111,400 after sending ePHI to a platform without a BAA. Source: [accountablehq.com](https://www.accountablehq.com/post/hipaa-compliance-for-healthcare-saas-companies-a-practical-guide) (undated). [unverified]
- Pending rule: a HIPAA Security Rule NPRM (2025) would make several addressable safeguards required for business associates; final rule expected summer 2026, unconfirmed. [unverified]

**DPA and GDPR.**
- No sourced cost or time. [design] Your standard DPA plus sub-processor list: 1-3 hours to set up once. Customer-paper DPA review: 2-6 hours and 1-4 weeks elapsed per deal. Transfer tools (SCCs) add 1-2 weeks if the customer wants them signed separately.

**Student data privacy (SDPC NDPA).**
- SDPC registry: 130,000+ signed DPAs between 12,000+ districts and 6,674 education providers. Source: [wsipc.org news: "version two of SDPC's National Data Privacy Agreement is available"](https://www.wsipc.org/news/version-two-of-sdpcs-national-data-privacy-agreement-is-available) and [sdpc.a4l.org](https://sdpc.a4l.org/agreement_info.php?state=PA). Version 2.2 published 2025-11-19 (legal reference, [edlaw.eduverse.com/docs/jurisdiction/org/sdpc/ndpa/](https://edlaw.eduverse.com/docs/jurisdiction/org/sdpc/ndpa/)).
- Term: about three years from approval (district pages). Signing with a pre-signed template: days (vendor glossary). Custom edits: weeks to months. [unverified]
- Hours [design]: 4-10 hours per district once the standard NDPA is signed; one signature can extend to other districts in the same state alliance.

**Certificate of insurance and minimums.**
- Public sector example (Larimer County SaaS requirements, [larimer.gov/finance/purchasing/insurance-requirements-information/SaaS](https://www.larimer.gov/finance/purchasing/insurance-requirements-information/SaaS)): general liability $1M per occurrence and $2M aggregate; professional/technology E&O $1M; cyber and network security/privacy $1M. Excess and umbrella can satisfy the total.
- Healthcare example: $1M per occurrence and $3M aggregate general and professional liability (Salem Health vendor terms, [enroll.globalrms.com/salemhealth/insurance](https://enroll.globalrms.com/salemhealth/insurance)).
- Market: limits of $2-$5M are not uncommon for small-to-medium vendors; larger or higher-risk vendors face $10M or more (Morgan Lewis, September 2025, [morganlewis.com/blogs/sourcingatmorganlewis/2025/09/cyberinsurance-requirements-in-tech-transactions-balancing-risk-and-market-practice](https://www.morganlewis.com/blogs/sourcingatmorganlewis/2025/09/cyberinsurance-requirements-in-tech-transactions-balancing-risk-and-market-practice)).
- Stage guide (Vouch, [vouch.us/insurance101/how-much-business-insurance-do-b2b-saas-companies-need](https://www.vouch.us/insurance101/how-much-business-insurance-do-b2b-saas-companies-need)): seed-stage about $500K-$1M general liability and $1M-$2M E&O; Series B and later $2M-$4M and $3M-$10M.
- Premium: not sourced. [design] Seed-stage SaaS typically pays about $1,000-$3,000 per year for $1M GL, about $1,500-$4,000 for $1M-$2M E&O/cyber combined. Get broker quotes. Calendar: certificate issued in 1-5 business days after binding (design).

**W-9 and supplier portals.**
- W-9: a one-page form, under 15 minutes. [design] Keep a signed copy and insurance certificate in a shared folder.
- SAP Ariba: onboarding is an email invitation, a registration questionnaire and document upload, then buyer approval. One customer (Rich Products, SAP case study) says the process now takes 7 days, down from three months. Veolia's SAP Ariba supplier guide (V1.6, April 2025, [veolia.com](https://www.anz.veolia.com/sites/g/files/dvc2011/files/document/2025/04/SAP%20Ariba%20Supplier%20Onboarding-%20V1.6_0.pdf)) lists bank details, tax forms and licences. Expect 1-4 hours of data entry and 1-3 weeks waiting for buyer approval. [design]
- Coupa: not found in this pass. [unverified]

**Cooperative contracts (Sourcewell, OMNIA Partners).**
- Sourcewell admin fee: sample clauses from 1% to 1.5% of completed sales, paid quarterly within 45 calendar days after quarter end (Lawinsider sample clauses; [sourcewell.org](https://www.sourcewell.org) general), and a 1-2% range in a third-party glossary. [unverified]
- OMNIA Partners: a supplier-funded admin fee as a percentage of spend; rate not found. Check the solicitation documents.
- Calendar: a solicitation cycle is usually months, not weeks (design: 4-9 months from solicitation to award). Hours to submit a proposal: 40-120 (design).

**GovRAMP (state and local cloud).**
- Fee schedule effective 2025-01-01 ([govramp.org PMO fee schedule PDF](https://govramp.org/hubfs/Resources%20-%20Updated%20Branding/Program%20Management%20Office%20Fee%20Schedule.pdf?hsLang=en)): Security Snapshot $1,000-$2,500 depending on revenue; monthly subscription option $750 for providers under $1M revenue, up to $1,600 above $5M; annual review for Ready status $500-$3,750; annual review for Authorized or Provisionally Authorized $1,500-$7,500; continuous monitoring from $250 per month for providers under $1M.
- Membership: from $1,500 per year (vendor-side source). [unverified]
- Third-party gap analysis: $10,000 for a small system to $150,000 for a complex one (consultant estimate). [unverified]
- Calendar: no reliable 2026 authorization timeline found. A North Carolina procurement document sets 2027 as the target to move to the new standard (secondary).

**FedRAMP.**
- Costs: $250,000 to over $2M (one source) and $500,000 to $4M (another) for Rev 5 authorization. [unverified: consultant estimates]
- Timeline: 12-36 months for the general Rev 5 program (secondary). [unverified]
- 20x: the Phase 1 pilot produced 12 Low authorizations from 26 submissions, closing September 2025. Public availability of 20x Low and Moderate was targeted for FY26 Q3-Q4. Sources: [fedramp.gov/docs/20x/phase1/intro/](https://www.fedramp.gov/docs/20x/phase1/intro/) and secondary commentary (Knox Systems, Secureframe). [unverified on current dates]
- Practical: for a small vendor with no federal pipeline, FedRAMP is not a 2026 priority. [design]

## Summary table (planning numbers)

| Item | Cost (US$) | Calendar | Founder hours |
|---|---|---|---|
| SOC 2 Type I, platform + audit | $15k-$40k year one [design from ranges above] | 3-4 months | 60-120 [design] |
| SOC 2 Type II | $30k-$80k total [unverified] | 6-12 months | 2-4 per week ongoing [design] |
| Pen test | $5k-$30k | 3-8 weeks incl. scheduling | 15-50 [design] |
| SIG Lite (first) | staff time only | 5-10 business days | 12-20 [design] |
| HECVAT Full (first) | staff time only | 4-12 weeks | 15-30 [design] |
| VPAT/ACR | $350 plus audit [unverified] | 4-8 weeks | 20-60 plus fixes [design] |
| HIPAA BAA | legal review | 1-12 weeks | 2-6 [design] |
| SDPC NDPA | staff time | days (template) to months (custom) | 4-10 [design] |
| GL/E&O/cyber minimum | roughly $3k-$10k per year total at seed [design] | 1-5 business days after binding | 2-4 [design] |
| GovRAMP | $1.5k-$7.5k annual plus assessments | unknown; 2027 target | 40-100 [design] |
| FedRAMP Rev 5 | $250k-$4M [unverified] | 12-36 months | very high [design] |

## Gaps and next steps

- Primary sources not fetched: Gartner buying-group releases beyond the two 2025 press releases; the 6sense 2025 report (403 on fetch); Forrester's deal-size tables.
- No verified source for: no-decision rate, champion turnover, the effect of losing a champion, HECVAT and SIG hours, BAA turnaround, Coupa onboarding, OMNIA fee rate.
- Before quoting any figure to a user, check the URL and date in the list above and mark it as primary, secondary or [design].
