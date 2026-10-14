# C3: Churn reasons in health segments (research as of 2026-10-14)

Scope: independent dental, medical and vet practices (including churn at DSO/PE roll-up acquisition); hospitals and health systems; pharma and life sciences.

Reading notes:
- No public source publishes cancellation-reason mixes for any of these segments. Every reason-mix table below is a [design] estimate built from the adjacent evidence cited in each section.
- Public retention disclosures are rare for vertical health software. The one usable public set is Weave (dental/medical, 10-K-style earnings releases). Other numbers are vendor or agency blogs and are marked [unverified].
- Several cited pages returned HTTP 403 to WebFetch (Weave press release, Becker's EHR article). Those figures come from search-result text and are marked accordingly.

---

## Segment A: Independent dental, medical and vet practices (incl. DSO / PE roll-up)

### 1. Churn level
- Logo churn: [design] 12–20% per year for SaaS sold to independent practices on annual contracts; 2–4% per month on monthly plans. Revenue churn runs about 3–6 points lower because larger multi-location customers stay.
- Public anchors, all imperfect: Weave, the dental/medical practice software vendor, reported dollar-based net retention of 93% and gross retention of 89% at 31 Dec 2025, and Q3 2025 GRR of 90% vs 92% a year earlier, which it attributed partly to newer medical verticals with higher churn (Weave Q4 2025 results, 18 Feb 2026, https://www.businesswire.com/news/home/20260218591820/en/Weave-Announces-Fourth-Quarter-and-Full-Year-2025-Financial-Results/; Q3 2025 detail via https://fintool.com/app/research/companies/WEAV/earnings/Q3%202025). Weave's GRR implies roughly 11% gross revenue loss per year across its mixed base, which is consistent with the range above.
- Recurly's current benchmark page lists 3.60% overall annual churn across all industries, 2.34% voluntary and 1.25% involuntary, with a 3.21% median for business and professional services (data as of July 2026, https://www.recurly.com/research/churn-rate-benchmarks, date per Chargeflow summary, [unverified]). These are subscription-billing figures for card-based products and understate contract-SaaS churn for practices.
- Involuntary share: [design] 15–25% of churned logos. Vendor blogs put involuntary churn at 20–40% of all subscription churn (Paddle estimate, repeated on Flycode and Churnkey pages, undated, [unverified]). Churnkey's sample of about 5M failed subscriptions found insufficient funds was 40.5% of failures (https://churnkey.co/blog/involuntary-churn-benchmarks, undated, [unverified]).
- Consolidation: about 13% of US dentists are DSO-affiliated (ADA Health Policy Institute, via Becker's, https://www.beckersdental.com/dentists/41051-13-of-dentists-are-affiliated-with-dsos-7-things-to-know.html, undated), and more than 1 in 4 dentists within 10 years of school were DSO-affiliated in 2024 (ADA News, Nov 2025, https://adanews.ada.org/new-dentist/2025/november/hpi-more-new-dentists-affiliated-with-dsos/). About 25% to nearly 50% of US vet practices are corporate-owned (Economic Liberties Project, May 2025, https://www.economicliberties.us/our-work/the-save-our-pets-act-stopping-the-corporate-takeover-of-veterinary-practices/; Frontiers in Veterinary Science, 2025, https://www.frontiersin.org/journals/veterinary-science/articles/10.3389/fvets.2025.1558745/full). Definitions differ.

### 2. Reason mix (design estimate, sums to 100)

| id | share |
|---|---|
| acquired_or_merged (DSO/PE takes the practice onto its own stack) | 18% |
| switched_competitor | 10% |
| price_too_high | 9% |
| payment_failed | 9% |
| business_closed | 12% |
| owner_retired_or_sold | 8% |
| champion_left (office or practice manager turnover) | 8% |
| not_using / low_adoption | 8% |
| onboarding_failed | 5% |
| poor_support | 5% |
| bugs_reliability | 5% |
| missing_feature | 3% |

Basis: the acquisition share is the largest single driver because roll-ups standardize practices on a group platform (see the Becker's note that a DSO merged 67 acquired practices onto its practice management system, https://www.beckersdental.com/dso-dpms/pennsylvania-dso-merges-67-acquired-practices-to-practice-management-system/, undated). Closures reflect the Becker's 2025 closure lists (17 and 18 closures; anecdotal, not a rate, https://www.beckersdental.com/dentists/18-dental-practice-closures-in-2025). Vet closures are visible in the Enterprise Practice Database count of 262 permanent enterprise-owned practice closures in Q1 2025 (trade press, Vet Advantage, June 2025 [unverified], https://mydigitalpublication.com/article/Industry+Insights/4984372/847017/article.html). Vet and dental PIMS lock-in (switching is costly, and vendor guides say data export needs notice) pushes "switched" down and "acquired" up.

### 3. Leading indicators
- Acquisition signals: a press release or LinkedIn post from a DSO or PE platform in the practice's region; the owner's sale process; a new practice manager hired from a group.
- Usage drop: fewer appointments or invoices per week, logins by one user only, a drop in payment-terminal or lab-integration activity (lab integration is cited as a retention anchor in vet PIMS, [unverified] Pulse RevOps page).
- Billing: card expired or declined, a PO-style invoice that is paid late, or a card moved to a new bank account.
- Staff: the office manager or practice manager who owns the software leaves.
- Support: multiple tickets on the same workflow in a month.

### 4. Timing
- Involuntary churn happens at card expiry and at renewal, with no notice.
- Acquisitions happen at a closing date, usually 60–120 days after the first signal, and the group may give the vendor 30–90 days' notice before migration. [design]
- Voluntary churn clusters at the annual renewal date and in the first 90 days after go-live. Practices rarely churn in the middle of tax season or a busy month. [design]
- Vet and dental practices run seasonal slow periods (summer, holidays) where owners review costs. [design]

### 5. Save tactics
- Pause or downgrade plans: the strongest save for closures and budget-driven cancellations. [design] 15–25% of at-risk accounts are retained this way.
- Dunning and card updater: recovers a large share of involuntary churn; a 30–50% recovery of failed payments is a design estimate, not a verified rate.
- Group-level contract: a multi-location or group discount that the acquirer must accept. This converts a lost practice into a retained group. [design]
- Integration switching cost (lab, imaging, payment terminal) raises retention, as vet vendors argue, [unverified].
- Save rates are not published for this segment.

### 6. What a solo founder can realistically do
- Track the acquisition signal per account (watch the owner's name and the local DSO or vet group news) and call the owner before the close date, not after.
- Ask for a group-wide or "acquired practice" contract that the buyer can adopt in place of its own platform.
- Build a dunning flow and a card updater first. This is cheap and recovers part of the involuntary share.
- Offer a pause option for seasonal dental and vet clinics.
- Export data cleanly on request. Vet data-portability complaints (a VIN News account of a Kansas vet whose old and new PIMS vendors blamed each other, undated, URL not retained) damage reputation when a practice leaves.

### 7. Sources
- Weave Q4 2025 results, 18 Feb 2026: https://www.businesswire.com/news/home/20260218591820/en/Weave-Announces-Fourth-Quarter-and-Full-Year-2025-Financial-Results/
- Weave Q3 2025 detail: https://fintool.com/app/research/companies/WEAV/earnings/Q3%202025 [secondary]
- Recurly churn benchmarks: https://www.recurly.com/research/churn-rate-benchmarks [unverified via summary]
- Churnkey involuntary churn: https://churnkey.co/blog/involuntary-churn-benchmarks [undated, vendor]
- Becker's DSO affiliation (ADA HPI): https://www.beckersdental.com/dentists/41051-13-of-dentists-are-affiliated-with-dsos-7-things-to-know.html
- ADA News, Nov 2025: https://adanews.ada.org/new-dentist/2025/november/hpi-more-new-dentists-affiliated-with-dsos/
- Becker's dental closures 2025: https://www.beckersdental.com/dentists/18-dental-practice-closures-in-2025
- Becker's DSO merges 67 practices: https://www.beckersdental.com/dso-dpms/pennsylvania-dso-merges-67-acquired-practices-to-practice-management-system/
- Economic Liberties Project, May 2025: https://www.economicliberties.us/our-work/the-save-our-pets-act-stopping-the-corporate-takeover-of-veterinary-practices/
- Frontiers in Veterinary Science, 2025: https://www.frontiersin.org/journals/veterinary-science/articles/10.3389/fvets.2025.1558745/full
- Digitail PIMS switching guide (vendor, [unverified]): https://digitail.com/guide-changing-your-pims/
- Stripo, June 2026 (champion departure 51% churn within 12 months; [unverified]): https://research.stripo.email/enterprise-saas-churn-rate-benchmarks-2026

---

## Segment B: Hospitals and health systems

### 1. Churn level
- Logo churn: [design] 3–6% per year for enterprise software sold to health systems; revenue churn 2–5%. Churn is rare mid-contract and concentrated at term end.
- Health-system buyers rarely cancel outright. The bigger risk is a forced rebid or consolidation onto another vendor.
- Involuntary churn: [design] 1–3%. Hospitals pay by invoice and PO, so card failures are rare. Late payment is more common and is usually a procurement delay, not a cancellation.
- Demand context: Fitch says rated hospitals used 2026 to lift revenue and trim expenses before federal Medicaid cuts take effect (Fitch, cited via HFMA Fast Finance, https://www.hfma.org/fast-finance/health-systems-preparing-for-medicaid-cuts-2026/, undated). Capstone projects the federal cuts reduce Medicaid outlays by about $911B over a decade, with most of the impact in 2027 and later (https://capstonedc.com/wp-content/uploads/2025/12/Provider-2026-Preview-Web.pdf, Dec 2025). Becker's cites a projected $80B provider revenue loss in 2026 (https://www.beckershospitalreview.com/finance/medicaid-cuts-would-cost-hospitals-80b-in-2026-spike-uncompensated-care-costs-report/, undated, [unverified] projection).
- Rural stress: Chartis's 2025 State of the State reported 46% of rural hospitals operating at a loss and 432 vulnerable to closure, up from 418 (Fierce Healthcare, Feb 2025, https://www.fiercehealthcare.com/providers/46-rural-hospitals-red-432-vulnerable-closure-report-finds). A later edition counted 417 vulnerable and 206 rural hospitals closed or converted since 2010 (https://www.fiercehealthcare.com/providers/417-rural-hospitals-risk-closing-rural-health-transformation-funds-may-be-too-late, undated).

### 2. Reason mix (design estimate, sums to 100)

| id | share |
|---|---|
| contract_term_end_rfp (forced rebid at term end) | 22% |
| consolidated_vendors | 18% |
| acquired_or_merged (health-system M&A) | 14% |
| champion_left (CIO, CMO or department lead) | 12% |
| budget_cut (Medicaid pressure, 2026 to 2027) | 10% |
| switched_competitor | 6% |
| poor_support | 4% |
| missing_feature | 5% |
| bugs_reliability | 3% |
| security_or_compliance | 3% |
| regulation_change | 3% |

Basis: KLAS reports that deep adopters of RCM suites consolidated for "vendor consolidation and a stronger vendor relationship," each cited by 57% of respondents, with pricing at 43% (KLAS via healthsystemcio, 21 Jul 2026, https://healthsystemcio.com/2026/07/21/rcm-suite-consolidation-partnership/). That supports the consolidation share. Becker's reports that hospitals making new EHR decisions fell 40% in 2025 vs 2024 and 50% vs 2023, which lowers the switching share overall (Becker's, date not shown, https://www.beckershospitalreview.com/healthcare-information-technology/ehrs/are-big-health-systems-done-switching-ehrs/; page returned 403, figure from search snippet). Only two systems with more than ten hospitals made enterprise EHR decisions in 2025, both choosing Epic (same source).

### 3. Leading indicators
- Executive change: a new CIO, CFO or CMO, or a new system leader after a merger.
- Consolidation signals: an announced merger or affiliation, or a system-level vendor review.
- Usage: falling active users in a department, or an invoice for fewer seats.
- Contract calendar: the term end is 6 to 12 months out and no renewal conversation has started.
- Budget: a request to cut seats or defer a module, typically during an FY budget cycle.
- Champion departure is the strongest single warning sign. A 2026 Stripo report (unverified vendor report) puts churn at 51% within 12 months after an internal champion leaves and 65% when the executive sponsor leaves.

### 4. Timing
- Churn clusters at term end and in the 60 to 120 days before it, when an RFP is issued.
- Fiscal-year budget season (often July 1 or October 1 for many systems) is when seat cuts and module deferrals are decided. [design]
- Notice: systems often signal in the 6 to 12 months before term end; a formal RFP notice typically comes 90 to 180 days before term end. [design]
- Mergers take 12 to 24 months to rationalize vendors, so the churn lag is long. [design]

### 5. Save tactics
- Multi-year renewal with a price lock, signed 9 to 12 months early. [design]
- Executive sponsor outreach to the new leader after a merger, before the new group runs its vendor review.
- Integration and data-exchange work that raises switching cost (interface with the EHR, data feeds). [design]
- Pilot-to-enterprise expansion: a second department added before the term end.
- No public save rates for health-system software. Treat any rate you see as unverified.

### 6. What a solo founder can realistically do
- A solo founder is unlikely to win a health system directly. The realistic churn defense is to sell into a department (not the enterprise) and build an exec-sponsor map for each account.
- Track the calendar: term end, RFP notice dates, and new-leader announcements on the system's own news page.
- Offer a short, fixed-scope renewal that fits a budget line the system already has, so it avoids the RFP.
- Avoid sole-champion dependence. Name at least two users per account who would be hurt by a switch.
- Build BAA and security documentation before the term end, since a missing SOC 2 or BAA can trigger a forced rebid. [design]

### 7. Sources
- Fitch and HFMA Fast Finance, health systems and Medicaid cuts 2026: https://www.hfma.org/fast-finance/health-systems-preparing-for-medicaid-cuts-2026/
- Capstone Provider 2026 Preview, Dec 2025: https://capstonedc.com/wp-content/uploads/2025/12/Provider-2026-Preview-Web.pdf
- Becker's, Medicaid cuts $80B (projection): https://www.beckershospitalreview.com/finance/medicaid-cuts-would-cost-hospitals-80b-in-2026-spike-uncompensated-care-costs-report/
- Chartis via Fierce Healthcare, Feb 2025: https://www.fiercehealthcare.com/providers/46-rural-hospitals-red-432-vulnerable-closure-report-finds
- Chartis later edition via Fierce Healthcare: https://www.fiercehealthcare.com/providers/417-rural-hospitals-risk-closing-rural-health-transformation-funds-may-be-too-late
- KLAS RCM consolidation via HealthSystemCIO, 21 Jul 2026: https://healthsystemcio.com/2026/07/21/rcm-suite-consolidation-partnership/
- Becker's, are big health systems done switching EHRs: https://www.beckershospitalreview.com/healthcare-information-technology/ehrs/are-big-health-systems-done-switching-ehrs/
- Stripo, June 2026 [unverified]: https://research.stripo.email/enterprise-saas-churn-rate-benchmarks-2026
- Lighter Capital 2025 benchmarks (healthcare SaaS revenue churn +67%, 2024 to 2025, sample of 155 startups, [unverified]): https://www.lightercapital.com/blog/2025-b2b-saas-startup-benchmarks

---

## Segment C: Pharma and life sciences

### 1. Churn level
- Logo churn: [design] 15–25% per year for SaaS sold to small and mid-size biotechs (many customers are funded by venture money and can shut down); 3–8% for large pharma enterprise contracts. Revenue churn is lower in pharma than biotech because pharma customers expand.
- Biotech funding stress is the main driver. BioSpace counted about 42,700 biopharma employees affected by cuts in 2025, up 47.1% year over year, which it attributed mainly to tighter capital markets (https://www.biospace.com/job-trends/biopharmas-axed-47-more-employees-year-over-year, 2025, date per article).
- Fierce Biotech's 2025 graveyard lists 19 biotech closures (16 closed, 3 on the way out), down from 22 in 2024 and a record 27 in 2023 (https://www.fiercebiotech.com/special-reports/2025-biotech-graveyard, Jan 2026 or late 2025, date not shown).
- Layoffs are easing: 17 biopharma companies announced layoffs in Apr–Jun 2026, against 64 in Q2 2025 (Fierce Biotech, Q2 2026, https://www.fiercebiotech.com/biotech/biotechs-better-position-avoid-workforce-reductions-layoffs-continue-drop-q226).
- Involuntary churn: [design] under 3%. Pharma and life-sciences buyers pay on invoice.

### 2. Reason mix (design estimate, sums to 100)

| id | share |
|---|---|
| business_closed (biotech shuts down or is acquired for its assets) | 22% |
| budget_cut (layoffs, cost programs) | 15% |
| acquired_or_merged (pharma M&A moves the account onto the acquirer's platform) | 14% |
| funding_ended (grant or venture round did not close) | 10% |
| consolidated_vendors | 9% |
| contract_term_end_rfp | 8% |
| switched_competitor | 7% |
| not_using / low_adoption | 6% |
| champion_left | 5% |
| security_or_compliance (validation, 21 CFR Part 11, data-residency issues) | 4% |

Basis: the closure and budget shares reflect the 2025 cut data above. Academic and government budgets also tightened (a trade-press report says government cuts constrained academic budgets, [unverified], https://www.tradeandindustrydev.com/industry/bio-pharmaceuticals/biotech-squeeze-cuts-research-are-reshaping-34990.md, date not shown). The acquired and switched shares reflect the Veeva-to-Salesforce split: Veeva separated from Salesforce in Sept 2025, existing customers have a transition window to 2030, and Salesforce says it has signed over 40 pharma clients for its Life Sciences Cloud, including Pfizer (Intuition Labs, https://intuitionlabs.ai/articles/veeva-vault-crm-migration-roadmap, 2025; Salesforce claims are self-reported). Benchling trimmed workforce by 9% (Clinical Trials Arena, date not shown, https://www.clinicaltrialsarena.com/news/life-sciences-software-company-benchling-trims-workforce-by-9/).

### 3. Leading indicators
- Funding news: no new round for 12 or more months, a runway warning, a board-level restructuring.
- Layoffs or a pipeline cut at the customer, which signal that the team using the software is shrinking.
- Champion or head-of-department departure, a common trigger in biotech.
- Usage: fewer active users or studies run on the platform.
- For pharma: a merger or divestiture announcement, and a vendor-platform decision (Veeva Vault CRM vs Salesforce) that forces a rebid.
- Validation: a change in quality-system scope that requires re-validation, which makes teams reluctant to change tools and can also block a switch.

### 4. Timing
- Biotech churn comes as a sudden event: a shutdown notice, a sale of assets, or a reverse merger. Notice to the vendor is often 30 days or less. [design]
- Pharma churn follows the platform calendar: a CRM or clinical-platform migration is a multi-year project, so notice is 12 to 36 months. [design]
- Budget-driven cuts land in the planning cycle (calendar-year budgets for many pharma companies). [design]

### 5. Save tactics
- Biotech: a seat-based downgrade to a smaller tier or a per-study plan. Stop the bleed rather than retain full ARR. [design]
- Pharma: multi-year contract with migration support and an extended transition window. The Veeva split shows how vendors use transition windows to hold accounts. Veeva says it has nine committed top-20 CRM customers including verbal commitments vs three for Salesforce (Veeva claim, self-reported, via Nasdaq, https://www.nasdaq.com/articles/veeva-systems-lifts-outlook-crm-wins).
- Validation and compliance support lowers switching cost for regulated customers. [design]
- No public save rates for life-sciences software. Treat any rate you see as unverified.

### 6. What a solo founder can realistically do
- Avoid over-exposure to venture-funded biotech. Cap any single biotech logo at a small share of ARR, and push annual prepay with a short cancellation notice requirement.
- Watch the funding calendar. When a customer announces a raise or a restructuring, call the champion and offer a smaller plan.
- Target the niche that the large platforms serve poorly (for example, a single lab workflow or a small CRO tool) and avoid direct competition with Veeva or Salesforce.
- Build the compliance paperwork (validation package, data-residency statement, audit logs) before a pharma buyer asks for it. A missing package makes a rebid more likely. [design]
- Price so that a shutdown leaves no unpaid balance: monthly plans for early-stage biotech.

### 7. Sources
- BioSpace, biopharma layoffs up 47.1% in 2025: https://www.biospace.com/job-trends/biopharmas-axed-47-more-employees-year-over-year
- Fierce Biotech, 2025 biotech graveyard: https://www.fiercebiotech.com/special-reports/2025-biotech-graveyard
- Fierce Biotech, layoffs ease in Q2 2026: https://www.fiercebiotech.com/biotech/biotechs-better-position-avoid-workforce-reductions-layoffs-continue-drop-q226
- Fierce Pharma, biopharma layoffs first half 2025 up 32%: https://www.fiercepharma.com/biotech/biopharma-layoffs-first-half-year-jump-32-yoy
- Trade and Industry Development, biotech squeeze: https://www.tradeandindustrydev.com/industry/bio-pharmaceuticals/biotech-squeeze-cuts-research-are-reshaping-34990.md
- Benchling workforce cut: https://www.clinicaltrialsarena.com/news/life-sciences-software-company-benchling-trims-workforce-by-9/
- Intuition Labs, Veeva Vault CRM migration roadmap: https://intuitionlabs.ai/articles/veeva-vault-crm-migration-roadmap
- Intuition Labs, Veeva and Salesforce split: https://intuitionlabs.ai/articles/veeva-salesforce-split-integration-data-impact
- Nasdaq, Veeva lifts outlook on CRM wins: https://www.nasdaq.com/articles/veeva-systems-lifts-outlook-crm-wins
- Hedder ARPU, Salesforce poaches pharma clients from Veeva: https://arpu.hedder.com/salesforce-poaches-pharma-clients-from-veeva-signaling-industry-battle
