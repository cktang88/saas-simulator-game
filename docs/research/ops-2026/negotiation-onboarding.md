# Negotiation and new-hire onboarding at early-stage startups (2024-2026)

Research slice for the SaaS founder simulator. Confidence tags: **[sourced]** = primary or named source found; **[secondary]** = only a blog or aggregator citing an original; **[unverified]** = could not confirm; **[design]** = game assumption, not a statistic. Searches run 16 Oct 2026. Several primary reports (Gallup, SHRM, BambooHR, Brandon Hall, Carta data library) could not be opened, so their figures stay [secondary].

## 1. Job-offer negotiation (candidate side)

**Offer acceptance rates**
- Ashby Offer Acceptance Rate report: about 78% overall, from ~230K applications that reached offer stage, Jan 2021 to Mar 2024 **[secondary, via noon.ai citing Ashby: https://www.noon.ai/blog/articles/357-offer-acceptance-rate-benchmarks-2026]**.
- Ashby's 2023 trends report: business roles run about 20 points higher acceptance than technical roles **[secondary: https://www.ashbyhq.com/blog/recruiting/2023-trends-report-offer-acceptance-rates]**. For a sim, technical candidates are the harder close.
- Other reported figures: Gem about 82% (1.2M hires), SmartRecruiters US 79% **[secondary]**.

**Negotiation gains**
- UCLA Anderson study of ~3,858 tech job seekers (data May 2023 to Feb 2025): candidates who countered gained about 12.45% in compensation terms, roughly $27K/yr on average **[sourced via summary: https://anderson-review.ucla.edu/most-job-seekers-skip-negotiation-and-pay-a-high-price/]**. The "most don't negotiate" framing is the key point for the game.
- Levels.fyi 2024 report: average total-comp increase from negotiation of about +11% mid-level, +20% senior, +17% staff **[sourced: https://www.levels.fyi/2024/]**. The 2025 page reports median TC growth of +3.49% for US SWE submissions, which is a different metric; do not mix the two **[sourced]**.
- Levels.fyi's negotiation service claims are self-reported marketing and should not be used as base rates.

**Counteroffers**
- Robert Half UK, fieldwork 17-24 Dec 2021, n=2,000: 53% of people who got a counteroffer accepted it; 34% of those had left within six months and 74% within a year **[sourced, but dated: https://www.roberthalf.com/gb/en/about/press/half-counteroffers-successful-hiring-crisis-continues]**.
- Robert Half Australia, Oct 2025, 500 hiring managers (employer view): 46% of employers who made a counteroffer said the person was still there, but nearly a third of those left within 12 months, and 7% declined the offer **[sourced via search summary, unverified against primary]**.
- Design read: a counteroffer is a deferral. Model a 35-50% chance the leaver is gone within a year, not zero.

**Exploding offers**
- Zorc and Tsetlin (game theory) describe an "acceptance-deterrence" effect: long deadlines make candidates more selective about other offers, so a short deadline helps when alternatives are scarce **[sourced via INSEAD summary: https://knowledge.insead.edu/leadership-organisations/when-deadlines-dont-work-perils-exploding-job-offer]**.
- INSEAD/Darden lab games (students) found exploding offers were punished more often than extended ones **[sourced, lab only]**.
- No field acceptance rate for exploding offers was found. An "8-13% efficiency" figure circulates without a source; do not use it.

**Equity vs cash**
- Carta's guidance: ask for the strike price and share count together, because a raw share count tells you little; equity is upside only and can be worth zero **[sourced: https://carta.com/data/linkedin-startup-equity-negotiation-five-tips/; https://carta.com/data/linkedin-startup-equity-not-cash-offer-letters/]**.
- Carta publishes no 2025 startup acceptance or negotiation-rate figure in what was found **[unverified]**.
- Pave's job postings say it targets the 75th percentile and does not negotiate base or equity **[sourced; conflicts with Levels.fyi, which lists negotiation services for Pave roles]**.

**Pay transparency (US)**
- No federal rule. States with posting rules include California (15+ employees; applies to remote roles open to CA applicants), Colorado (any Colorado employee), New York (4+ employees; NYC penalties up to $250K per violation as one source reports), and Washington **[secondary, multiple compliance blogs; thresholds conflict across sources]**.
- Penalties per violation: about $100 to $10K in CA/CO/WA in one summary; Washington has seen 300+ class-action filings since June 2024 **[secondary]**.
- California SB 642 (effective 1 Jan 2026) extends the Equal Pay Act limitation to three years **[secondary]**.
- Many multistate startups post the strictest rule for all roles. Check each state's labor agency before relying on thresholds.

**EU Pay Transparency Directive**
- Transposition deadline: 7 June 2026. Most member states missed it **[sourced summary: https://remoteworkeurope.eu/news/2026/eu-pay-transparency-most-states-miss-deadline/]**.
- Trackers disagree on the list. One says Italy, Slovakia, Lithuania and Malta were fully transposed on time, with Belgium, Malta and Poland partial; Netherlands moved to Jan 2027; Ireland will miss; Austria, Hungary and Luxembourg had not acted **[sourced but conflicting; re-check national laws]**.
- Salary ranges in job ads and a ban on pay-secrecy clauses are the core job-side rules **[sourced via Deloitte/Ashurst summaries]**.

## 2. Founder-side negotiations (brief)

**Enterprise deals**
- Prepay discounts cluster at 15-20%. Two months free is about 16-17% **[secondary, consultancy: https://www.getmonetizely.com/articles/how-do-top-saas-companies-structure-their-discount-programs-a-strategic-guide]**.
- Median enterprise discount off list: about 16.7%; upfront payment adds a further 5-10% **[unverified, knowledgelib.io]**.
- Large-deal discounts are higher (Salesforce 250-2,000 seats: 30-40% off list; above 2,000: 40-50%) **[secondary, consultancy, Salesforce-specific]**.
- Net-60 or net-90 payment terms are a cheap concession for the vendor, so buyers ask for them **[secondary: cloud-spend advisor]**. Expect net-30 as the default.
- Liability caps: a common anchor is about three months of fees; deviation from market is leverage **[secondary, South African reference]**.
- Legal review timing: no sourced benchmark found. Vendor blog ranges (payment terms 3-14 days; custom legal language 14-49 days) are unsourced **[unverified]**.

**Vendor/SaaS contracts**
- Annual-prepay discounts for SaaS vendors: 15-25% range; 15-20% most common **[secondary]**.
- Multi-year, volume, and net-60/90 terms are the usual asks **[secondary]**.

**Term sheets and SAFEs**
- Not researched in depth for this slice. Use the fundraising and angel notes already in docs/research.

## 3. New-hire onboarding

**Cost of early attrition**
- Share leaving within 90 days: about 28% (Jobvite 2018, as summarized) to about 33% in secondary blogs **[secondary, dated]**.
- Work Institute: 38% of employees quit in year one; 40% of those departures happen in the first 90 days **[secondary]**.
- Gallup "replacement costs up to 200% of salary": could not verify **[unverified]**.
- Brandon Hall claim: strong onboarding raises retention 82% (relative) and productivity over 70% **[secondary; original not opened]**.
- SHRM-attributed "50% higher retention, 62% greater productivity" for structured onboarding **[secondary, unverified]**.
- Gallup claim that employees well supported in week one are 69% more likely to stay up to three years **[secondary, unverified]**.
- Design read: a poor first 90 days should carry a visible, traceable cost. Model roughly one-in-four to one-in-three early exits, with a larger drop when onboarding is weak. Label the effect [design].

**Time to productivity (ramp)**
- Engineers: DX (six multinational enterprises) found engineers using AI daily reached their 10th pull request in 49 days versus 91 days without AI **[sourced via DX blog: https://getdx.com/blog/ai-cuts-developer-onboarding-time-in-half/]**.
- Engineers, general: 3-9 months to full productivity (TechClass survey); Jellyfish reports 6+ months **[secondary]**.
- AE/SDR: top SaaS companies 3-4 months ramp, average 5-7 months (Sales Benchmark Index via Monetizely, undated) **[secondary]**. A stat aggregator (Libertify) gives 5-6 months for client-facing roles **[weak]**.
- No clean SDR vs AE split found. Use Bridge Group or Sales Benchmark Index reports if precision is needed.
- Support and CSM ramp: not found **[unverified]**. Use [design] values (support 4-8 weeks; CSM 2-4 months) and tag them.

**First-week mechanics (US)**
- Form I-9 Section 1: employee completes by their first day of paid work **[secondary, DOJ publication summary]**.
- Section 2: employer completes within three business days after start; if the job is shorter than three days, by the first day **[secondary: Ogletree, J.J. Keller, university guides]**.
- E-Verify case creation timing: sources differ on whether the hire day counts. Ogletree reads it as not counting; check USCIS guidance before relying on it **[unverified]**.
- The USCIS I-9 page was checked and gives no timing rule; the Handbook for Employers M-274 is the next place to look **[sourced gap]**.

**Founder and manager hours, setup, equipment, access**
- No sourced figures found for founder hours per hire, laptop cost, or provisioning time.
- [design] suggestion: laptop plus peripherals $1,500-3,000 (the brief's range, unverified); founder/manager time 6-10 hours in week one and 2-4 hours/week for the rest of month one; account and access provisioning 1-3 days; offboarding same day for access revocation.
- Pre-boarding (accounts and equipment shipped before day one) is treated as a lever in secondary sources but no effect size was verified **[unverified]**.

## Gaps and next steps
- Open primary reports: Ashby 2026 State of Startup Hiring, Levels.fyi 2025 report, Carta data library, Robert Half US counteroffer survey, Gallup and SHRM onboarding pages, Brandon Hall/Glassdoor study.
- Pay transparency and EU transposition status should be re-checked before the game ships; they change quarterly.
- Keep game numbers tagged [design] wherever a sourced figure is missing.
