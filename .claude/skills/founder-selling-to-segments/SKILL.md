---
name: founder-selling-to-segments
description: Plan B2B sales into a specific buyer segment as a real founder in 2026 - identify the segment (mom-and-pop shops, restaurants, trades, trucking, medical and dental practices, hospitals, pharma, law and accounting firms, real estate, agencies, e-commerce, startups, mid-market, enterprise, banks, insurance, manufacturing, utilities, city/state/federal government, K-12, higher ed, nonprofits, churches, hotels, franchises), map the buying committee (who uses, champions, signs and can block), pick the sales methodology and discovery questions, plan procurement and paperwork early (SOC 2 timing, BAAs, student-data agreements, HECVAT, VPAT, cooperative contracts, GovRAMP/FedRAMP, fiscal-year timing), multi-thread, handle common scenarios, and decide whether a segment is worth it for a solo founder. Use when the user asks "who do I sell to at a school district / hospital / bank / city", "who signs", "why is the deal stuck", "do I need SOC 2", "how long will this take", "should I go after enterprise or government", "what is a HECVAT/BAA/NDPA/VPAT", "how do I sell to restaurants/contractors/dentists", or wants a segment sales plan.
---

# Founder selling to a buyer segment (2026)

You are helping a real founder plan sales into one buyer segment. The buyer's size, committee, procurement rules and fiscal calendar usually decide the outcome more than the pitch. Be concrete: give roles, dates, hours and dollars, and say whether each number is **sourced** (with its date) or a **[design]** planning estimate. Most cycle, committee, win-rate and churn figures for these verticals have no independent source; treat them as priors to be replaced by the founder's own data after 5-10 deals. Never present a planning estimate as a statistic. Dollar thresholds, deadlines and regulations change: tell the founder to verify them with the buyer, and recommend a lawyer for contract and regulatory questions (general information, not legal advice).

Reference data: `docs/research/buyer-segments.md` (synthesis, sources, conflicts) and `public/data/buyer-segments.js` (30 segments with committees, cycles, paperwork, scenarios and objections). Raw notes: `docs/research/buyer-segments/`. If the user is running the simulator, `segmentFor()`, `committeeFor()`, `cycleDaysFor()` and `paperworkFor()` return the same structure.

## Step 1: Gather context (one message)
Ask only what is missing:
1. Product, the painful outcome it fixes, and ACV (annual price per customer). Who uses it daily, and who would pay?
2. The target customer: industry, headcount, location (US state matters for public buyers), and whether they sell to one customer type or several (for example solo law firms vs AmLaw, independent dental practices vs DSOs).
3. Stage: customers so far, references, whether SOC 2, a DPA or a security page exists.
4. Constraints: hours per week for sales, months of runway, budget for compliance, co-founder or sales help.

## Step 2: Identify the segment and its sub-band
Match the customer to one of the ids below. If the founder sells to two populations, pick the small-buyer one first and treat the large buyer as a later, separate motion (committee and cycle differ 5-10x).
- Unknown company under 100 employees: `startup_smb`. 100-999: `mid_market`. 1,000 or more: `enterprise`.
- Cycle days are for the band holding the typical ACV; use the data file for the other bands. Budget months are when money is set; FY is when the fiscal year starts.

| id | ACV | Cycle days (typical band) | Solo fit | FY starts / budgets set | Paperwork that bites |
|---|---|---|---|---|---|
| `retail_shops` | $200-$1.5k | 1-14 | 0.6 | Jan / Nov-Jan | none |
| `restaurants` | $1k-$6k | 1-14 | 0.5 | Jan / Oct-Dec | pci attestation, soc2 type2, dpa |
| `salons_fitness` | $300-$6k | 1-14 | 0.6 | Jan / Nov-Jan | pci attestation, security questionnaire, dpa |
| `trades` | $600-$5k | 1-21 | 0.6 | Jan / Oct-Dec | security questionnaire, dpa, soc2 type2 |
| `trucking` | $150-$6k | 1-14 | 0.6 | Jan / Oct-Jan | security questionnaire, dpa |
| `general_contractors` | $10k-$60k | 30-90 | 0.25 | Jan / Oct-Dec | msa redlines, security questionnaire, dpa |
| `health_practices` | $1.5k-$12k | 1-14 | 0.65 | Jan / Oct-Dec | hipaa baa, security questionnaire, dpa |
| `hospitals` | $20k-$100k | 180-365 | 0.25 | Jul / Mar-May | hipaa baa, security questionnaire, soc2 type2 |
| `pharma` | $15k-$80k | 180-270 | 0.2 | Jan / Sep-Dec | security questionnaire, soc2 type2, supplier audit |
| `law_firms` | $1.5k-$30k | 30-75 | 0.65 | Jan / Sep-Dec | soc2 type2, security questionnaire, sig lite |
| `accounting_firms` | $2k-$15k | 30-60 | 0.45 | Jan / Sep-Nov | ftc safeguards wisp, dpa, security questionnaire |
| `real_estate` | $600-$30k | 1-14 | 0.5 | Jan / Nov-Dec | security questionnaire, mls data use review, dpa |
| `agencies` | $600-$30k | 7-30 | 0.65 | Jan / Oct-Dec | dpa, security questionnaire, soc2 type2 |
| `ecommerce` | $300-$3k | 1-14 | 0.8 | Jan / Aug-Oct | dpa, security questionnaire |
| `startup_smb` | $3k-$30k | 14-45 | 0.7 | Jan / Nov-Jan | security questionnaire, dpa, soc2 type2 |
| `mid_market` | $10k-$60k | 30-75 | 0.45 | Jan / Oct-Dec | soc2 type2, dpa, msa redlines |
| `enterprise` | $25k-$250k | 120-180 | 0.12 | Jan / Sep-Nov | msa redlines, vendor portal, soc2 type2 |
| `hotels` | $3k-$25k | 30-90 | 0.6 | Jan / Oct-Dec | pci attestation, dpa, soc2 type2 |
| `franchise_systems` | $1k-$50k | 30-90 | 0.3 | Jan / Sep-Nov | dpa, security questionnaire, msa redlines |
| `banks` | $5k-$30k | 45-120 | 0.35 | Jan / Oct-Dec | soc2 type2, dpa, sig lite |
| `insurance` | $1.5k-$12k | 7-30 | 0.6 | Jan / Oct-Dec | soc2 type2, dpa, sig lite |
| `manufacturing` | $8k-$40k | 45-120 | 0.3 | Jan / Sep-Dec | security questionnaire, ot security questionnaire, soc2 type2 |
| `utilities` | $10k-$80k | 120-270 | 0.2 | Jul / Apr-Jun | security questionnaire, vendor portal, soc2 type2 |
| `local_gov` | $3k-$30k | 14-56 | 0.5 | Jul / Mar-Jun | vendor portal, security questionnaire, dpa |
| `state_gov` | $15k-$150k | 90-270 | 0.25 | Jul / Jan-Jun | vendor portal, vpat, security questionnaire |
| `federal` | $25k-$200k | 30-120 | 0.2 | Oct / Jan-Mar | sam registration, vpat, security questionnaire |
| `k12` | $4k-$35k | 60-150 | 0.35 | Jul / Jan-May | sdpc ndpa, security questionnaire, vpat |
| `higher_ed` | $3k-$25k | 45-120 | 0.3 | Jul / Jan-Feb | hecvat, vpat, dpa |
| `nonprofits` | $500-$6k | 1-14 | 0.6 | Jan / Oct-Dec | nonprofit verification, board packet, dpa |
| `churches` | $300-$3k | 14-90 | 0.7 | Jan / Nov-Dec | child safety policy, dpa, pci attestation |

All values are [design] except where the research notes cite a source; the synthesis lists them. Solo fit is 0-1.

## Step 3: Go / no-go for a solo founder
Use the fit score as a gate, then check the runway:
- **0.6 or higher** (retail, salons, trades, trucking, e-commerce, startups, small practices, small law firms, agencies, hotels, nonprofits, churches): a founder can sell by phone, in person, marketplace or trial. Go, but expect high churn (20-35%) and low ACV.
- **0.3-0.59** (restaurants, mid-market, real estate, accounting, local government, banks, K-12, higher ed, manufacturing, franchises): go only with a narrow wedge (one vertical, one integration, sub-threshold deals) and a paperwork pack built first.
- **Under 0.3** (general contractors, hospital systems, pharma, utilities, state and federal government, enterprise, AmLaw, DSOs): do not start here. Prove the product in an easier segment, then enter through a reseller, a cloud or cooperative-contract vehicle, a partner who carries the account, or a mid-market reference. The first dollar costs months of unpaid effort and a compliance function a 1-3 person company does not have.
- **Runway test [design]:** runway in months should be at least 2x the cycle (days / 30) at the target ACV plus the paperwork lead time in Step 6. If a $60k hospital deal takes 9-12 months and a SOC 2 Type II takes another 6-12, a founder with 12 months of cash is betting the company on one deal.
- **Pipeline arithmetic:** divide the monthly revenue goal by ACV, then by the segment win rate (15-28% qualified, [design]); 40-50% of qualified deals end in no decision [design, no verified primary source], and that is already inside those win rates.

## Step 4: Map the buying committee
For every deal, name a person for each role, or write "unknown" and make finding them the next step.
| Role | Ask | Warning sign |
|---|---|---|
| User | Who touches it daily? How many? | Buyer is not the user (60-90% in committee segments) and nobody has met a user |
| Champion | Who feels the pain and would sell for us when we are absent? | A friendly user with no budget or access to the signer |
| Economic buyer | Who can release the money alone? What else is needed besides your agreement? | "I'll run it by my boss" with no meeting booked |
| Technical / IT | Who approves SSO, integrations, hosting, the network? | IT surfaces after the demo (hidden veto) |
| Security / compliance | Who reviews vendors? What do they need and how long does it take? | A questionnaire arrives after a verbal yes |
| Legal / procurement / finance | Who redlines, who registers vendors, who owns the budget line? | A threshold you did not know about (quotes, RFP, board) |
| Board / council / owner's spouse / union / clinical | Is there a vote, a quarterly meeting, a bargaining duty or a value-analysis committee? | A meeting calendar that adds 4-12 weeks |
- **Committee size by ACV [design, anchored on Gartner 5-16 and Starr 3.1/6.8/11.2]:** under $5k 1-2 people; $5-25k 2-4; $25-100k 4-7; over $100k 7-12. Owner-led segments stay at 1-3 whatever the price.
- **Multi-thread.** Gong (secondary, correlational) found multithreaded deals over $50k win far more often and won mid-size deals have three or more buyer participants in meetings; the game discounts that, but the habit is right. Rule of thumb: two engaged contacts by the first proposal, three or more above $25k, and a named second champion before any cycle longer than 90 days.
- **Consensus.** Gartner (2025): 74% of buyer teams show unhealthy conflict. Give each stakeholder a short note in their own terms (cost for the owner, audit trail for compliance, workflow for the user) rather than one deck for all.

## Step 5: Pick the method and the questions
- Under $5k, one decision-maker: **BANT-lite** plus **value selling** (three questions, one before/after number, a trial or refund).
- Owner-led or small practice ($1-25k): **value selling** (hours saved, no-shows, missed calls, food cost) with **SPIN** discovery for the user.
- $10-50k with one real approver: **MEDDICC**. From about $25k or any security, legal or procurement step: **MEDDPICC** with a mutual action plan. **Challenger** when the buyer thinks the status quo is fine. **Gap selling** for workflow tools; **solution selling** for technical or OT products.
- Questions to ask in the first two calls (these map to the six MEDDICC flags in the simulator's call scorecard):
  - Pain and metrics: "Tell me about the last time this went wrong. What did it cost?" "What number moves if this works, by how much, by when?"
  - Economic buyer and decision process: "Walk me through the last software purchase you made. Who signed? What else was needed?" "What happens if you do nothing for a year?"
  - Decision criteria and paper process: "What would make you drop a vendor?" "What do security, legal and procurement need from us, and how long do they take?"
  - Champion: "Would you introduce me to the person who signs?"
- Metrics and the economic buyer are rarely confirmed on a single call; schedule the follow-up that proves them.
- Past behaviour only (Mom Test): no hypotheticals, no pitching before the problem is sized. Ask for a dated next step.

## Step 6: Plan procurement and paperwork before the buyer asks
Ask for the buyer's process on call one: card limit, quote and RFP thresholds, board approval, fiscal year, vendor registration, required documents. Then build in this order, cheapest first (costs and times are ranges from vendor and consultant pages; hours are [design]):
1. **Day one (hours):** W-9, certificate of insurance (GL, E&O, cyber; about $2.5k-$10k a year in total at seed, certificate in 1-5 days), a standard DPA and sub-processor list (1-3 h), an MSA with a fallback liability cap (12 months of fees, super-cap for data breach), a one-page security summary.
2. **Weeks:** a SIG Lite or CAIQ answer library (12-20 h first time, 2-4 h to reuse), a SOC 2 status or bridge letter, a business-continuity and exit summary, a short privacy policy and data map.
3. **Months:** pen test ($5k-$30k, 3-8 weeks including fixes), SOC 2 Type I ($15k-$40k, 3-4 months), then Type II ($30k-$80k all-in, 6-12 months, 2-4 h a week of evidence).
4. **Segment-specific:**
   - Health: HIPAA BAA before any PHI (1-2 weeks from your template, 4-12 weeks on theirs); Epic integration review 8-16 weeks for a listing; pharma needs a supplier audit, a quality agreement and a validation package (months).
   - K-12: the student-data privacy agreement (SDPC NDPA, v2.2 published 2025-11-19; days with the template, months with edits), a state exhibit, COPPA and FERPA statements, VPAT.
   - Higher ed: HECVAT (full 15-30 h, then reuse), VPAT (4-8 weeks), FERPA language, an LTI path.
   - Government: vendor portal registration, VPAT, a sole-source justification the champion can use, a cooperative contract (Sourcewell, OMNIA, NASPO ValuePoint; 4-9 months and about 1-2% admin fee) or a state portal, GovRAMP status for states that require it (NC from 2026-04-01, AZ renewals from 2026-07-01), SAM.gov registration for federal.
   - Federal cloud: FedRAMP costs $250k or more and 12-36 months; do not start without a funded federal pipeline. Use a reseller or sell a non-cloud option.
   - Banks and insurers: SIG Lite or Core, SOC 2 Type II, pen test, BCP and an exit plan; core-provider marketplace rules. Accountants: FTC Safeguards WISP summary. Real estate: MLS data-use review (2-6 weeks). Franchises: franchisor approved-vendor application (60+ days).
- **SOC 2 timing rule [design].** Do not buy it for sub-$5k owner-led segments. Start Type I when deals of $25k+ are in the pipeline or three questionnaires have stalled deals; start it about 6-9 months before the first $50k+ deal you expect to close. The simulator assumes a security review on about 5% of deals under $5k, 25% under $15k, 60% under $50k and 85% above [design].
- Never imply certifications you lack. Offer the honest ladder: security page, then answer library, then bridge letter, then Type I with a Type II date.

## Step 7: Time the calendar
Work backwards: approach month = budget-set month minus the cycle; payment month = fiscal-year start plus a few weeks.
- July 1 fiscal years (46 states; most K-12 districts, cities, counties, universities, many hospitals): budgets are set January-June, so approach October-March; most K-12 purchases close May-July (secondary). Late August and the last two weeks of June are poor.
- Federal: fiscal year starts October 1; the Q4 spend rush runs July-September (a September 30 deadline means orders in August); new budgets January-March.
- Calendar-year buyers (most companies, banks, practices, restaurants): budgets are set October-December; approach September-November; avoid the last two weeks of December.
- Seasonal freezes: e-commerce November-December; restaurants and retail at holiday peaks; accountants January-April (sell May-October, go live before January); insurance agencies October-January; trucking Q4; HVAC and roofing in summer; schools in August; churches around Holy Week and Christmas.
- Renewals are re-buying events in public and regulated segments: diary them 90-120 days ahead.

## Step 8: Handle the scenarios
Prepare for the scenarios the data lists for the segment; the common ones:
- **Buyer is not the user (very common).** Demo to the user, give the buyer one number and a one-page memo they can forward; ask for 20 minutes with the signer.
- **Champion leaves or is reassigned.** Prevent it: second champion and a mutual action plan from the first proposal. Recover: re-run discovery with the new owner and re-send the pilot results.
- **Hidden blocker (IT, security, core provider, franchisor, spouse, bookkeeper, union).** Ask "what would stop you approving this?" in call one and send the security pack before the demo.
- **Forced RFP.** Ask whether it is a formality or the preferred vendor is already named; decline if so. If you bid, reuse one template and ask the champion to write measurable criteria. Cooperative contracts and sole-source justifications avoid the RFP when allowed.
- **Budget freeze or fiscal-year slip.** Offer a sub-threshold pilot, a smaller scope, or a letter of intent with the first invoice in the next fiscal year. Do not discount without a commitment.
- **Board, council or committee approval.** Learn the calendar and agenda deadline; give the champion a one-page packet (cost, sunset clause, endorsing leader); allow 4-12 weeks.
- **Reseller only.** Register with the reseller's partner program; accept a lower margin for access; keep a direct relationship with the user.
- **Bottom-up adoption that has to be converted.** Pull usage data, find the budget owner, and propose a department or company plan priced against the time already saved.
- **"We'll think about it" / no decision.** One follow-up in about a week with a specific ask; close-lost after about three weeks; revisit at the next budget window. Treat no decision as the main competitor.

## Step 9: When a segment is not worth it
Say so plainly when any of these hold:
- Fit under 0.3 and no reseller, marketplace or partner route.
- Runway under 2x the cycle plus paperwork lead time.
- The paperwork bill (FedRAMP, SOC 2 Type II, a validation package) exceeds roughly 12 months of expected revenue from the segment.
- ACV under about $1k with a committee or a formal process; cold outbound rarely pays back, so use product-led, community, marketplace or partner channels.
- A mandatory approved-vendor list, incumbent contract or core-provider integration excludes you and the founder cannot get on the list within the runway.
- Churn is structurally above 30% and the product has no way to move up-market (single-truck owners, solo stylists, small restaurants, agents); that can still work as a self-serve side channel, not as the core business.
Suggest the nearest easier wedge: for hospitals, small practices; for state and federal, cities and counties under the no-bid threshold; for enterprise, mid-market references and a cloud marketplace; for AmLaw, solo and small firms; for pharma, a non-GxP tool in clinical operations.

## Output format
Deliver: (1) the segment, sub-band and fit score with a go / narrow / no-go call; (2) a committee map table with a named person or "unknown" per role and the next action per gap; (3) method and the ten questions for the first two calls; (4) a paperwork plan with order, cost, hours and weeks, and the trigger for SOC 2; (5) a dated calendar back-solved from budget and fiscal-year timing; (6) the top five scenarios for this segment with the response to each; (7) pipeline math with weekly activity targets; (8) the top three risks and what would make the segment a no-go. Label every number as sourced (with date) or [design]. Keep it tight.
