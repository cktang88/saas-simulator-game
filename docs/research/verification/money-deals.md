# Natural loophole blockers: money and deals

Scope: fundraising, angels/accelerators, debt, M&A, accounting/tax, payments, grants. Written 2026-10-16.

Tags: **[src]** = confirmed in a search this session (URL given); **[unverified]** = practitioner knowledge or vendor claim, no primary source checked; **[design]** = my own estimate or game-tuning proposal, not a real statistic. Detection percentages in this file are almost all [design] because no one publishes "fraction of lies caught". Treat them as calibrated guesses from the structure of each check.

Core principle for the sim: lying is rarely caught at the moment it is told. It is caught at the first step where an independent third-party data source (bank, Stripe, tax filing, customer, former employee) is compared against the claim. Each mechanism below is a gate with a time, a data source, and a miss rate that depends on what is misstated and by how much.

---

## 0. Scale anchors (criminal and regulatory cases)

- **Frank / Charlie Javice**: told JPMorgan the startup had 4M+ customers; it had under 300k. JPM paid $175M in 2021. Convicted March 2025 (conspiracy, bank fraud, wire fraud, securities fraud); sentenced Sept 2025 to ~7 years. Lie was caught in post-signing integration (a marketing test to the "customer" list bounced massively), i.e. after money moved, in the buyer's first use of the data. [src: https://abc7news.com/post/charlie-javice-sentenced-7-years-prison-fraudulent-175m-sale-financial-aid-startup-frank/17906192/]
- **Joonko / Ilit Raz** (the brief wrote "Raveh"; SEC names Raz): claimed 100+ customers incl. Fortune 500, $1M+ revenue, 100k+ candidates; actual revenue never above ~$100k; fabricated testimonials; when an investor got suspicious she sent falsified bank statements and forged contracts, then admitted forgery when confronted (mid-2023). SEC complaint June 2024, at least $21M raised; reportedly pleaded guilty in SDNY (~$27M). Lie surfaced via one suspicious investor asking for verification. [src: https://www.sec.gov/news/press-release/2024-70 ; https://www.sec.gov/litigation/litreleases/lr-26020 ; plea: https://www.jpost.com/business-and-innovation/article-908411 (status not rechecked)]
- **HeadSpin / Manish Lachwani**: told investors ~$80M ARR vs about $10M actual (end 2019); bogus invoices used for financing; >$100M raised 2017-2020. Board found out; pleaded guilty April 2023, 18 months prison, $1M fine, 3 yrs supervised release. [src: https://www.cfodive.com/news/headspin-founder-lachwani-sentenced-18-months-prison-fraud-SEC-Justice/713903/]. Lie surfaced internally (board / new finance leadership), not from investor diligence.
- **Theranos / Holmes**: ~11 yr 3 mo sentence Nov 2022 [unverified this session, from memory]. Lie was about technology, not revenue; caught by journalism and regulator inspection.
- Pattern for game: outright fabrication is a felony with prison; typical caught-after-close lag is 3 months to 3 years; detection triggers are (a) integration or first real use of the claimed asset, (b) a skeptical investor asking for raw bank/Stripe access, (c) internal whistleblower, finance hire or board, (d) next-round diligence.

---

## 1. Venture fundraising

### 1.1 Pitch stage (first meeting to partner meeting)
- **What is checked**: almost nothing hard. Investors take deck metrics at face value; they test plausibility (growth shape, retention vs benchmark, CAC story), founder references and market logic. Time: 1 to 3 weeks across 2-4 meetings. [unverified; widely stated practitioner consensus]
- **Catches**: implausible shapes (e.g. $0 to $1M ARR with no customers findable on LinkedIn or no web footprint), founder inconsistencies between meetings, easy-to-google claims (customers, logos, press, credentials). **Misses**: inflated MRR, counting pilots/LOIs as ARR, annualizing a spike, counting non-paying users. Detection at pitch: misstatement <20% about 3%; 2-3x about 15%; 10x about 35% (mainly via plausibility and logo checks) [design].
- **Founder cost**: 10-25 founder hours/week during a raise; deck and metrics prep 20-40 h [design].
- **Honest founders**: define metrics in the deck footnote (MRR = paying, recurring, net of discounts), show a dated Stripe screenshot or live dashboard, offer references up front. Precise, slightly conservative numbers raise trust, because diligence will reproduce them.

### 1.2 Data room by stage
- **Pre-seed**: deck, a simple metrics sheet, product demo, cap table (often just founders), maybe a Stripe screenshot. No formal data room. Diligence is a few calls. [unverified]
- **Seed**: add MRR by month with customer-level detail, cohort retention, burn/runway, incorporation docs, IP assignment (CIIAA) for founders and contractors, cap table (Carta/Pulley export), SAFEs/notes outstanding, top-customer contracts, pipeline. [unverified]
- **Series A**: add 24-36 months financials (P&L, balance sheet, cash flow), ARR bridge (new/expansion/contraction/churn), cohort tables by logo and dollar, customer concentration, contracts, security posture (SOC 2 progress), employment and contractor agreements, option ledger and 409A, tax filings, litigation list, open-source and IP review, privacy/DPAs. Often a QoE-lite or CPA-reviewed financials for larger A's. [unverified]
- Time to assemble: seed 10-20 h, Series A 40-80 h (more if books are messy, plus legal and accountant fees $5-30k) [design].

### 1.3 Confirmatory diligence after the term sheet
- **Timeline**: term sheet to close typically 4-8 weeks for seed priced round, 6-10 weeks for Series A; SAFE rounds close in days with almost no confirmatory diligence. [unverified; typical practitioner ranges]
- **What is checked and by whom**:
  - Financial/metrics: read-only Stripe (or billing system) access, bank statements or bank read-only, QuickBooks/Xero access; investor associate or an outsourced analyst reconciles MRR from the billing system to deposits in the bank to the P&L. Misses only what is consistent across all three (i.e. real revenue that is not recurring, or discounts/side credits).
  - Cohort data: rebuilt from raw customer-level exports. Catches cherry-picked cohorts, hidden churn, annual plans counted as MRR.
  - Customer references: 3-8 calls, partly chosen by founder; investors often add 1-2 of their own picked from the customer list or LinkedIn. Catches nonexistent customers, pilot-only use, bad satisfaction, and misstated contract values.
  - Founder backchannels and background checks: 5-15 informal calls to ex-colleagues, ex-investors, prior co-founders; formal background check (employment, education, litigation, criminal, sometimes credit) done by counsel or a vendor in the final stage (1-2 weeks). Catches fake credentials, prior fraud/disputes, past investor burns, co-founder conflicts.
  - Cap table and IP: counsel reviews incorporation, board consents, stock issuances and vesting, 83(b)s, option grants vs plan, SAFEs and conversion math, CIIAAs, contractor assignments, licenses, OSS. Catches missing IP assignment, undisclosed SAFEs/promises, bad grants, unfiled 83(b)s.
  - Legal: litigation, contracts, privacy, employment classification, tax.
- **Detection by misstatement size** [design]: 
  - Metrics inflated 5-10%: 25-40% caught (reconciliation often shows small definitional gaps; usually becomes a "clarify" not "fraud").
  - Inflated 25-50%: 75-85%.
  - Inflated 2x or more, or fabricated customers: 90-97% (a single Stripe export against the claimed number is enough); only forged data feeds (fake bank statements, fake Stripe screenshots, wash trading through a shell) avoid it, and those are the Joonko/HeadSpin type of felony.
  - Undisclosed cap table promise or missing IP assignment: 70-90% (counsel review plus rep disclosure schedule).
  - Hidden founder history (prior failed company with investor disputes): 40-60% via backchannel [design].
- **Founder cost**: 30-60 h of founder time over 4-6 weeks at A; legal fees to company counsel $15-40k at seed priced round, $30-80k+ at A, often partly paid by the company out of proceeds [unverified; typical ranges].
- **Consequences when caught pre-close**: (a) honest discrepancy: re-trade (valuation cut 10-30%, or tranching/milestones, bigger option pool pre-money) or request for cure; (b) material or dishonest: deal dies, term sheet withdrawn, no break-up fee but you lose 4-8 weeks, burn runway, and the lead tells peers (below). Exclusivity ("no-shop") typically 30-45 days means your other investors went cold; a dead deal in exclusivity is a real cost [design].
- **Honest founders**: pre-assemble clean data, reconcile Stripe vs bank vs books before the term sheet, disclose bad news proactively (churned logo, missing assignment), fix IP paperwork early, volunteer references including a churned customer.

### 1.4 Reps and warranties in SAFEs and priced rounds
- **SAFE (YC post-money)**: company reps are short: due organization, authority, no conflicts, capitalization, no violations; no extensive financial reps. Little contractual hook, but fraud and securities law (Rule 10b-5, state blue-sky) still apply; a misrepresentation in the pitch can support rescission or damages. [unverified; YC SAFE form is public, check text]
- **Priced round (NVCA SPA)**: extensive reps: capitalization, financial statements, no undisclosed liabilities, IP ownership, compliance, litigation, taxes, material contracts, employee matters, plus a disclosure schedule. Breach remedies: indemnity (often limited/uncapped for fraud), rescission, and for the founder personally only if they signed as a party or the claim is fraud. Many VC deals have no escrow and rely on the company's cash and fraud law; survival of reps commonly 12-24 months. [unverified]
- **Consequences when a rep proves false**: investor demands correction (cap table fix, anti-dilution make-whole, extra shares), uses protective provisions to block next financing, board control fights, or sues for fraud/rescission. Founder personally liable for fraud (not shielded by corporate form) [src-level general law; case examples Section 0].
- **Game**: reps create a "liability tail" attached to every statement made in a closed round: each exaggerated metric gets a latent discovery event with a hazard rate that increases when the next investor, an acquirer, or a finance hire does diligence.

### 1.5 Information rights and post-close reporting (how lies surface later)
- Major-investor info rights: annual and quarterly financials, annual budget, inspection rights; monthly updates are a norm rather than right at seed. Board seats at A. SAFE holders rarely have info rights unless a side letter. [unverified]
- Mechanisms: monthly investor update with a number that does not square with last month, bank balance in a board deck vs the runway claimed, audit committee/CPA review at A+, auditors confirm AR with customers (in audited cases), new CFO or fractional finance lead reconciling and discovering. HeadSpin was discovered internally by the board/finance. [src above]
- Detection hazard for an inflated-ARR company with investors: roughly 25-35% per year for a mid-size lie rising to 60%+ at the next round's diligence; at Series B with audit/QoE essentially certain for anything over ~20% [design].
- Consequences: board removal of CEO, down-round with punitive terms, forced restatement, investor suit, SEC if investors are non-accredited or securities fraud.

### 1.6 Investor networks ("VCs talk")
- Signals travel through co-investors on the same cap table, shared LPs, partner dinners, scout networks, Twitter/X and private Slack/WhatsApp groups, and reference checks that are asked of other investors who passed. Passed-on deals are rarely explained negatively without cause, but "I would not back them again" is shared quickly when diligence found a lie. Trust damage is persistent: practitioners say a founder who lied to one VC is effectively locked out of that investor's circle and the latter's co-investors [unverified; qualitative].
- **Game parameters** [design]: reputation scalar per founder with network-spread; a diligence-found dishonest discrepancy cuts probability of term sheet from the investor's 2-hop neighbors by 40-80% for 2-3 years; an honest cure (disclosed early) cuts only 5-10%. Spread lag: 1-4 weeks.

---

## 2. Angels and accelerators

- **Angels**: verify very little. Typical angel checks: Google/LinkedIn the founder, 1-2 reference calls (often from the founder's list), look at the product, confirm accredited status (angel's own obligation, often self-certified). Revenue is rarely reconciled. Many angels invest on trust in 1-3 meetings and sign a SAFE. [unverified; see also docs/research/angels-and-landscape-2026.md]
- **Detection by misstatement**: <2x about 5-10%; fabricated customers 25-40% (a curious angel asks to talk to a customer); forged documents rarely checked [design].
- **Where lies surface**: first investor update that does not match what angels told each other; angel syndicate with a skeptical lead (SPV leads often do more checking); next-round lead's diligence and its cap table findings; angels talk to each other in group chats.
- **Consequences**: angels can sue for fraud/rescission of the SAFE (rare but real; small amounts make litigation uneconomic, so the realistic consequence is reputation, loss of follow-on and warm intros, pro-rata friction), and securities-law exposure if solicited publicly without a valid exemption (Rule 506(b) no general solicitation; 506(c) requires verifying accredited status) [src-level general law; verify in legal doc]. Regulators: SEC and state AGs in egregious fraud (Joonko precedent).
- **Accelerators (YC etc.)**: application is self-reported; interviews are 10 minutes and probe plausibility and depth. Post-acceptance: Stripe/revenue is often shared in office hours or via the batch dashboard; partners reward weekly growth so inflated figures are noticed by a partner who looks at the real numbers. YC demo day investors receive batch-curated metrics that YC partners have seen. Companies can be removed/asked to leave for dishonesty; the loss of the YC brand is the major penalty. [unverified; no primary on removal frequency]
- **Honest founders**: simple dated metrics, real customer intros, update investors monthly even when bad.

---

## 3. Debt and financing

### 3.1 Bank and fintech term loans / lines
- **What is checked**: business and personal credit pulls (FICO, Dun & Bradstreet/Paynet), 3-12 months bank statements (now often via Plaid read-only connection that cannot be forged), business tax returns (1-2 years) and personal returns, YTD P&L and balance sheet, accounts receivable aging, ownership documents, UCC lien search, state good-standing and litigation search. Time: online lenders hours to 5 days; banks 3-8 weeks; SBA 1-3 months. [unverified; general lender practice]
- **Catches**: nearly all revenue inflation (bank statements via Plaid are ground truth), undisclosed debt (UCC filings), tax discrepancies (tax returns / IRS Form 4506-C transcript verification for SBA and many banks), identity and ownership misstatement. **Misses**: customer contract quality, accounting accrual games that do not touch cash, projections.
- **Detection** [design]: inflated revenue on application with live bank connection: 95%+; forged statements to a bank-run process: 60-80% (bank fraud units, 4506-C tax transcript mismatch); cash-flow window dressing (round-tripping money before the statement period): 30-50%.
- **Consequences**: declined (recorded on credit file/inquiry), blacklisting across fintech lenders sharing fraud consortium data [unverified]. Material false statement to a federally insured bank is bank fraud (18 U.S.C. 1344, up to 30 years) and false statement to a bank (18 U.S.C. 1014) [statute; verify]; Javice conviction included bank fraud counts [src].
- **Personal guarantees**: lenders to early-stage startups require unlimited personal guarantee (PG); lender can pursue the founder's personal assets on default and the PG cannot be discharged by the LLC/C-corp. SBA 7(a) requires PGs from every 20%+ owner. [unverified for general; SBA SOP is primary - check]
- **Covenants and reporting**: bank loans typically require annual financials, quarterly compliance certificates, minimum liquidity and DSCR covenants, notice of material changes, restrictions on additional debt and dividends. Breach: event of default, rate increase (default rate +2-5%), cure period (often 30 days), acceleration, collateral seizure, lender-initiated lien (UCC-1 on all assets). Venture debt (SVB-style) adds warrants, minimum cash and MAC clauses. [unverified]

### 3.2 Revenue-based financing / Stripe Capital-style advances
- **Data connection**: Stripe/PayPal/bank and accounting connections via API; underwriting model reads MRR, churn, refunds, chargebacks, concentration; offers in minutes. Stripe Capital invites are generated from the processor's own data so inflation is not possible; repayment is a fixed % of daily Stripe sales automatically withheld. [unverified; Stripe docs primary - check]
- Cost: fixed fee (typically 6-20% of advance) [design/unverified]. Misstatement is mostly irrelevant because the data source is the lender's own feed; the real trap is cost: effective APR can be 20-60%+ for short repayment.
- Gaming risks and consequences: routing revenue through another processor to escape the holdback breaches the agreement (breach, fees, immediate full balance due, collections); stacking multiple advances triggers cross-default and UCC filings; MCA-like contracts with confession of judgment can reach personal assets in some states.

### 3.3 SBA loans (7(a), Express, Microloans)
- Verification: SBA Form 1919/1920, tax transcripts via 4506-C, credit pulls, personal financial statement, business plan, collateral; lender and SBA review; SBA OIG investigates fraud; certification of use of proceeds. PG required from 20%+ owners. [unverified; SBA SOP primary should be read]
- Consequences when false: loan denial, repayment demand, referral to SBA OIG and DOJ (False Claims Act, bank/wire fraud), debarment. Pandemic-era PPP/EIDL showed enforcement years later (look-back of 5-10 years under the statute of limitations) [unverified].

---

## 4. M&A / selling the company

### 4.1 Micro-SaaS marketplaces (Acquire.com, Flippa, brokers)
- Verification practice: marketplace requires seller to connect Stripe, analytics (GA), sometimes bank; "verified" revenue badges are derived from direct Stripe API connections (the buyer sees the real numbers); buyers get a data room after signing NDA; offer to LOI in days; LOI to close 30-60 days; payment via escrow service; asset transfer (domain, code, accounts) staged with buyer acceptance period. Fees: Acquire.com success fee historically about 4-10% [unverified; check current fee page]. 
- Market data: Acquire's 2025 report reports holdbacks in 14% of deals and seller financing in 13% of deals analyzed [src via https://www.paddle.com/news/industry/acquire-market-report-2025-saas-m-and-a ; secondary]. 
- Catches: any revenue claim contradictory with connected Stripe data (near-certain); churn hiding; transferability problems (customers on legacy plans, unmanaged API keys); undisclosed OSS or license issues (buyer technical review); bot traffic. Misses: seller's hidden time dependency (founder-only support), pending refunds/disputes after the verification window, customer concentration if only top-level numbers are examined.
- Detection by size [design]: revenue inflated >10% with Stripe connected: >90% (data is the data); selling "net profit" with undisclosed founder-time or owner perks: 40-60% pre-LOI via add-back review, higher in final due diligence.
- Consequences: deal falls through at diligence (most common), price re-trade 10-30%, holdback/escrow claim afterward, marketplace ban/reputation; fraud claims if documents are forged.

### 4.2 Larger deals: LOI to close
- Steps: LOI (non-binding with exclusivity, 30-90 days), confirmatory diligence (financial QoE, tax, legal, commercial, tech/security, HR), definitive agreement (SPA/APA) with reps and warranties, signing, closing, post-close adjustments. Typical LOI to close 60-120 days for SMB software [unverified].
- **QoE (quality of earnings)**: third-party accountant rebuilds EBITDA/ARR from bank, billing and general ledger; tests revenue recognition (ASC 606), deferred revenue, accruals, add-backs, working capital peg; sell-side QoE ahead of marketing can pre-empt the buyer. Catches: unsupported add-backs, cut-off errors, ARR inflated by non-recurring revenue, deferred revenue under-accrued (buyer takes liability of service owed), related-party transactions. Costs $15-60k for small-lower-middle-market SaaS (up to $100k+ larger) [unverified; vendor ranges]. Founder hours: 40-100 h.
- **Escrow and holdbacks**: indemnification escrow typically 5-20% of price held 12-24 months [src: https://livmo.com/blog/what-happens-after-selling-saas/ ; secondary/broker blog], another source 5-15% [same]. Used to cover breach of reps, working-capital true-up and undisclosed liabilities.
- **R&W insurance (RWI)**: buyer-side policy typical for deals > ~$20-50M EV [unverified]; premium about 2-4% of limit; retention ~0.5-1% of EV; insurer excludes known issues and fraud-by-seller is recoverable from seller (subrogation). Not common for micro SaaS.
- **Earnouts**: 20-40% of deal value, median performance window 24 months [src: https://www.l40.com/insights/earnouts-ma via search summary], and one cited stat of 21 cents on the dollar average payout from SRS Acquiom data [src: livmo link above; secondary - verify at SRS Acquiom]. Earnout disputes are common because buyer controls operations. 
- **Clawbacks**: for fraud, breach of reps, or if earnout metrics revised; post-closing working capital adjustment; buyer can set off against seller notes/holdbacks. Founder personal liability for fraud is uncapped and survives escrow limits; Javice case is the extreme [src].
- **Detection by misstatement size** [design]: 5% ARR overstatement: 40-60% in QoE (small misclassifications are often found and priced rather than called fraud); 20%+: 90%; fabricated customers: 97% (confirmation calls with 5-10 largest customers; bank deposit matching); post-close discovery of lies that diligence missed (e.g. hidden churn notice, key-person dependence): 50% within 12 months because integration surfaces it (Frank).
- **Consequences**: price chip during diligence (re-trade) 10-30% typical when issues are found [unverified]; walk-away; escrow claims; earnout offsets; fraud suit; criminal referral (Frank).
- **Honest founders**: sell-side QoE, clean ASC 606 books, customer contracts organized, honest add-backs with support, defined ARR policy, transition plan, key customer calls pre-arranged, reasonable escrow acceptance.

---

## 5. Accounting and tax

- **CPA review/compile/audit**: Bookkeeper -> CPA tax return prep -> (optional) CPA review (limited assurance) -> audit (required by lenders/investors or at scale). A CPA preparing returns will question obvious inconsistencies (revenue vs 1099-K vs bank) and refuse to sign a return they believe false. Tax return preparer penalties and Circular 230 give preparers incentive to catch errors. [unverified/general]
- **1099-K / 1099-NEC matching**: IRS Automated Underreporter (AUR) matches third-party information returns to filed returns; a mismatch generates a CP2000 notice, typically 1-2 years after the tax year, proposing additional tax plus accuracy penalty (20% for substantial understatement) and interest. [IRS practice; verify]. Threshold status: OBBBA restored 1099-K to $20,000 and 200 transactions (retroactive), and 1099-NEC/MISC threshold rises from $600 to $2,000 for payments made in 2026 [src: https://www.avalara.com/us/en/blog/one-big-beautiful-bill-act-1099-reporting-threshold.html ; https://cpapracticeadvisor.com/2025/07/30/one-big-beautiful-bill-act-changes-1099-thresholds/165863/ ; vendor sources, confirm at IRS.gov]. Not filing 1099-NEC to contractors: penalties per form ($60-$340 per form depending on lateness, 2024-25 [unverified, inflation-indexed]) and risk of reclassification audits.
- **IRS audits**: overall exam rate is low (roughly 0.4% of individual returns, corporations lower for small assets; higher for large) [unverified this session; search returned nothing on audit rates]. Most issues surface via automated matching, not field audits. Field/office audits are triggered by scoring (DIF), large refunds, large credits, and amended R&D claims. Time: notice to resolution 3-18 months; accountant fees $3-15k [design]. Statute of limitations 3 years normally, 6 if >25% understatement, none for fraud [IRC; verify].
- **Sales tax nexus**: post-Wayfair economic nexus thresholds commonly $100k sales or 200 transactions per state (varies; many states removed transaction count) [src-level general; verify per state]. SaaS taxability varies by state (taxable in ~20 states, e.g. TX, NY, WA, PA, others) [unverified]. Enforcement: states send nexus questionnaires, use payment-processor data and marketplace/1099-K data; audits look back for unfiled years (often 3-4 years, indefinite if never registered), collecting uncollected tax from the company (you cannot recoup from customers) plus penalties 10-25% and interest. Voluntary disclosure agreements can cap lookback and waive penalties; they are a "honest path".
- **R&D credit (Sec. 41 / Sec. 174 changes)**: payroll-tax offset for startups up to $500k/yr (QSB) [IRC; verify]; IRS scrutinizes credit claims, especially from aggressive promoters; since 2022-23 IRS requires more detail on Form 6765/amended claims (new required fields from 2025 tax year) [unverified]. Disallowance rate in exams is high for poorly documented claims [unverified]. Cost of audit: documentation of qualified research hours, time tracking, wages; penalties 20% accuracy; credit repayment.
- **Delaware franchise tax**: C-corp annual report due March 1; default "authorized shares" method can produce bills of $85k+ for startups with 10M authorized shares and few assets; "assumed par value capital" method lowers to the $400 minimum or low hundreds typically. Late penalty $200 plus 1.5%/month interest; failure leads to loss of good standing, void charter after prolonged non-payment (affects fundraising diligence: good-standing certificate). [unverified this session but well-known; verify at corp.delaware.gov]
- **Detection and consequence** [design]: unreported revenue vs 1099-K (processor reports gross): ~70-85% detected within 3 years by AUR; payroll misclassification (contractor treated as employee): 20-35% per audit trigger (worker complaint, unemployment claim is the biggest); sales tax nexus missed: 30-50% over 3 years once sales >$500k/state; R&D credit overclaim: 25-40% if audited, penalty 20%.
- **Honest founders**: bookkeeper monthly close, CPA quarterly, estimated taxes, 1099s by Jan 31, state nexus review at 6-12 months, Delaware assumed par value method, document R&D time contemporaneously.

---

## 6. Payments

- **Stripe/processor KYC/KYB at onboarding**: business identity, beneficial owners (25%+), director, website review, product description; usage matched against stated business model. Time: instant to 2 days; extra documents if flagged. [unverified, Stripe docs]
- **Ongoing risk reviews**: automated models flag volume spikes, high refunds, disputes, unusual card patterns; manual review requests contracts, delivery proof, customer lists. Outcome ranges: request for info, payout hold (days to weeks), rolling reserve (e.g. 5-25% held 90-180 days) [unverified, typical processor practice], limits on processing volume, account termination with funds held up to 90-180 days.
- **Chargeback monitoring: Visa VAMP** (replaces VDMP/VFMP). Merchant "Excessive" ratio (fraud TC40 + disputes TC15 over settled CNP transactions) threshold cut from 2.2% to 1.5% on April 1, 2026 in US/Canada/EU/APAC (CEMEA reportedly stays 2.2%); merchant enforcement began Oct 1, 2025; acquirer Above Standard (>=0.5%?) and Excessive (>=0.7%) tiers from Jan 1, 2026; reported fee up to about $8 per eligible event once enforcement active; volume floor reported 1,500 events (sources conflict on whether events or transactions) [src, vendor blogs only: https://chargebackhelp.com/visa-vamp-thresholds-just-got-stricter-in-2026/ ; https://www.chargeflow.io/blog/what-are-visas-new-vamp-rules-a-2025-guide-for-merchants ; https://fraudio.com/blog/visa-vamp-guide ; conflicting acquirer figures, verify against Visa documentation]. Mastercard ECM/EFM thresholds historically 1.5% and 100 chargebacks/mo for excessive; 1% & 100 for ECP [unverified, verify].
- **MATCH list (Mastercard)**: terminated merchants listed 5 years, with reason codes (excessive chargebacks, fraud, laundering, violation of rules); effectively blocks getting a new standard merchant account; high-risk processors only at higher rates/reserves [unverified, widely documented; check Mastercard MATCH docs].
- **Founder behaviors that trigger**: card testing attacks on free trials (many tiny auths) which also raise fraud ratios, selling beyond the stated business, refunds to avoid disputes (some games), delayed fulfillment, unclear billing descriptor, hard-to-cancel flows, trial-to-paid surprise charges, and transaction laundering through another entity.
- **Detection and costs** [design]: dispute ratio crossing 1.5%: automatic flag within 30 days; first breach consequence: warning plus remediation plan (30-90 days), then fines per dispute ($8 fee style), reserve of 10-25%, termination at persistent breach (3-6 months); termination -> MATCH 5-year; moving funds to a second processor costs 2-6 weeks migration hours and re-underwriting.
- **Honest founders**: clear descriptor, easy cancel, pre-dispute alerts (Verifi/Ethoca), 3DS, fraud rules (Radar), proactive refunds on request, evidence packets within deadlines, monitor ratio weekly.

---

## 7. Grants (SBIR/STTR)

- **What is checked**: eligibility at application (US-owned and controlled >50% by US citizens/permanent residents or qualifying VC-owned small business for some agencies, <=500 employees, for-profit US business; for STTR a research-institution partner); self-certifications at proposal and again at award/each invoice/final report; "life cycle certification" (SBA requires certification at various times that eligibility remains true, including regarding foreign ownership and the principal investigator's primary employment). Agencies perform limited verification; SBA's Company Registry and a new security-due-diligence regime (foreign risk) were added with the 2022 reauthorization. [unverified details; GAO-24-105470 and GAO-21-413 are primary]
- **Audits/fraud**: GAO found 37 SBIR/STTR fraud schemes with ~$34.7M in civil settlements and notes agencies lacked consistent fraud risk assessments [src: https://www.gao.gov/products/GAO-24-105470]; earlier GAO found agencies did not fully collect eligibility certifications [src: https://www.gao.gov/assets/gao-21-413.pdf]. SBA OIG publishes SBIR/STTR fraud conviction and settlement lists (updated Sept 2025) [src: https://www.sbir.gov/fraud-waste-abuse]. Example settlement: Kansas engineering firm ~$672k to resolve False Claims Act allegations on SBIR/STTR funds [src: https://www.justice.gov/usao-ks/pr/engineering-firm-kansas-pay-672352-settle-false-claims-allegations ; headline only].
- **Typical misuse**: PI not primarily employed by the small business, duplicate awards for same work, subcontracting above the limits (STTR/SBIR percentage rules), charging unallowable costs, misreporting hours, foreign ownership/influence undisclosed.
- **Consequences when caught**: repayment of funds, False Claims Act treble damages plus per-claim penalties (indexed; DOE OIG slide cited $11,000 per claim in 2019, now higher) [src: https://www.orau.gov/2019SBIRPhaseIR2/presentations/Day1-06-Gadren.pdf ; dated], suspension and debarment from federal awards, criminal prosecution for false statements, loss of SBIR eligibility; whistleblower (qui tam) suits by employees or competitors are the major detection path.
- **Detection odds** [design]: eligibility lie at proposal: 10-20% (cross-checks with SAM/ownership data); cost-charging misuse over a Phase II: 15-30% by agency audit or DCAA-type review; whistleblower in a company with disgruntled employees: raises odds sharply. Time: audit 3-12 months, settlement years later (FCA lookback 6-10 yrs).
- **Honest founders**: separate time tracking, grant-specific accounting, compliant subcontract %, current registrations (SAM), keep PI > 50% employed, respond to data-call surveys accurately.

---

## 8. Summary table

| mechanism | stage / timing | detection odds [design unless noted] | consequence | game parameter suggestions |
|---|---|---|---|---|
| Pitch plausibility check | Pre-seed to A, week 1-3 | 3% small lie (<20%), 15% for 2-3x, 35% for 10x | Silent pass, no deal, no explanation | Per-meeting `plausibility_flag` roll vs metric gap; failures show only as "pass"; hours 10-25/wk |
| Billing/bank reconciliation in confirmatory DD | After term sheet, 4-8 weeks | 30% (5-10% lie) / 80% (25-50%) / 95% (>=2x or fake customers) | Re-trade (10-30% valuation) or deal dies; exclusivity wasted (30-45 days) | `lie_gap` -> detect prob curve; require "forge data" action with felony flag and 15-25% separate forgery detection |
| Customer reference calls | DD, weeks 2-5 | 60-80% for nonexistent/unhappy customers | Deal dies / bad-rumor | Reference list chosen by player + 1-2 random; satisfaction drawn from real NPS state |
| Founder backchannel/background | Late DD / throughout | 40-60% hidden history; fake credential 90% | Deal dies, reputation | Persistent `founder_history` flags (failed co, disputes, burned investors) |
| Cap table / IP / legal DD | After term sheet | 70-90% on missing IP assignment/undisclosed SAFE | Cure cost, re-trade, delay 1-3 weeks, legal fees $15-80k | Paperwork-state checklist tied to company history; each omitted item adds delay and fee |
| Reps and warranties (SPA/SAFE) | Close; tail 12-24 months | Latent: hazard rises at next-round DD/finance hire | Make-whole shares, indemnity, rescission, fraud suit, personal liability | `claims_ledger` of statements; discovery event when later diligence touches that field |
| Info rights / monthly reporting | Post-close monthly | 25-35%/yr for mid lie; 60%+ at next round | Board action, CEO removal, punitive down-round, restatement | Investor update numbers cross-checked with actual state; mismatch -> trust penalty |
| VC network signal spread | 1-4 weeks after incident | n/a | Closed-door effect on 2-hop investors for 2-3 yrs | Network graph reputation; dishonest -40-80% offer prob, honest cure -5-10% |
| Angel light verification | Pre-seed/seed, 1-3 meetings | 5-10% small; 25-40% fabricated customers | Lost follow-ons/intros; rare suits; SEC for egregious | Angel `diligence_depth` low; lies mostly surface later via updates and next lead |
| Accelerator checks | Application to demo day | 15-30% via partner contact with real numbers | Dismissal/brand loss [unverified] | Partner-visible metrics; inflated claims create growth expectation traps |
| Lender bank-statement/Plaid + credit + tax transcript | Application, hours-8 weeks | 95%+ live bank feed; 60-80% forged statements | Denial; bank fraud felony for forged docs; PG calls | Data feed = ground truth; forged docs trigger crime flag |
| Personal guarantee and covenants | Loan life | Breach detection ~100% (reporting) | Default rate, acceleration, personal asset seizure | PG flag exposes founder net worth; covenant breach event with 30-day cure |
| RBF/Stripe Capital withholding | Daily repayment | 100% (processor holds) | Cost 6-20% fee; diverting revenue = breach | Auto % of daily sales; diversion -> full acceleration |
| SBA 7(a) verification | 1-3 months | 4506-C tax match; high | Denial, OIG referral, FCA years later | Slow cycle; strict doc requirement |
| Acquire.com / micro-SaaS verification | LOI to close 30-60 days | >90% revenue lie with Stripe connected | Deal dies, re-trade 10-30%, holdback claims | Revenue shown is Stripe truth; seller's levers are add-backs and hidden dependency |
| QoE | M&A, 3-8 weeks | 40-60% (5% overstatement); 90% (20%+) | Price re-trade; walk-away; fraud claims | Cost $15-60k, 40-100 h; offer sell-side QoE as honest strategy |
| Escrow/holdback and earnout | Close to 12-24 months | Claims recovered per breach | 5-20% of price held 12-24 mo [src secondary]; earnouts 20-40%, avg 21 cents/dollar paid [src secondary] | Holdback % and earnout payout probability drawn by buyer control and seller honesty |
| RWI | Mid-market deals | Insurer excludes known; subrogates on fraud | Seller liable for fraud beyond cap | Optional, EV threshold |
| CPA review / AUR 1099-K match | Annual; notices 1-2 years later | 70-85% for unreported 1099-K revenue within 3 yrs | CP2000: tax + 20% penalty + interest | Revenue under-reporting -> delayed bill with accumulated interest |
| Sales tax nexus | Ongoing, lookback 3-4 yrs | 30-50% over 3 yrs after ~$100k/state | Back tax from company, 10-25% penalties; VDA | Per-state sales counter, registration action, lookback bill event |
| R&D credit audit | After claim | 25-40% | Disallowance + 20% penalty | Documentation quality drives audit outcome |
| Delaware franchise tax | March 1 annually | 100% (state billing) | $200 + 1.5%/mo; void charter eventually | Default method shock bill; assumed-par fix action |
| Payments KYC/risk review | Onboarding, ongoing | High for pattern anomalies | Hold, reserve 5-25%, termination, 90-180d funds hold | Risk score from refunds/disputes/volume spikes |
| Card networks (VAMP/MATCH) | Monthly ratio | 100% for ratio breaches | 1.5% merchant threshold (Apr 2026) [src vendors]; ~$8/event; MATCH 5 yrs | Dispute ratio meter; stage warnings -> fines -> termination |
| SBIR/STTR eligibility/audit | Application, annual certs, audits | 10-20% eligibility lie; 15-30% cost misuse | Repayment, FCA treble damages, debarment, prosecution | Annual cert event, audit lottery; whistleblower trigger |

## 9. Top 10 for a SaaS-founder game

1. Confirmatory diligence reconciliation (Stripe, bank, books) with gap-size detection curve.
2. VC reputation network spread (dishonest vs honest cure).
3. Term sheet to close process with exclusivity cost (time, re-trade, deal death).
4. Cap table, IP assignment and paperwork tail (cheap to fix early, costly later).
5. Reps and warranties / claims ledger with discovery at next round, hire or acquirer DD.
6. Post-close investor updates cross-checked against reality.
7. Lender data feeds, PG, and covenants (ground truth data; personal exposure).
8. M&A: QoE, escrow, holdback, earnout with buyer-controlled payout.
9. Payments risk: dispute ratio meter (VAMP), reserves, termination, MATCH.
10. Tax notices: 1099-K matching, sales tax nexus with lookback, Delaware franchise tax shock, R&D credit, plus SBIR certification as a lower-priority variant.

## 10. Notes for implementation (design)

- Detection should be a function of `gap = claimed/actual` and the verification data source: hard (Stripe, bank, tax transcript) vs soft (deck, references). Soft sources use low probabilities; hard sources approach certainty unless the player forges (separate felony path with its own lower, still real, odds).
- Honest strategies should visibly cost less: prepare data, run sell-side QoE, disclose problems, remediate early. Cost examples: fewer re-trades, faster close, lower legal fees, higher offer probability. They do not guarantee success.
- Latency matters: show a delayed consequence (notice 12 months later, claim 18 months later), always with a traceable cause line in the end-of-game or post-mortem.
- Escalation ladder for bad behavior: friction, then price cut, then deal death, then network reputation, then civil claim, then criminal case. Reserve criminal cases for fabrication and forged documents.
