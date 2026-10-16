# Employee benefits, time off and absence at US startups (2026)

Scope: US startup benefits, PTO and absence realism, with short notes on EOR and international hires. Figures are from web searches run in this session; secondary vendor-blog figures are flagged. Design assumptions are marked [design].

## 1. Health insurance

**Employer premiums (KFF 2025 Employer Health Benefits Survey, published 22 Oct 2025)**
- Average annual premium: about $9,325 single, about $26,993 family. Single rose about 5% and family about 6% from 2024. Source: https://www.kff.org/health-costs/2025-employer-health-benefits-survey/
- Worker share: $1,440 single (about 16%) and $6,850 family (about 26%).
- Derived employer share: about $7,885/yr (about $657/mo) single and about $20,143/yr (about $1,679/mo) family. Use these as the default cost per covered employee [design, derived].
- Small firms (10-199 workers) paid $26,054 family vs $27,280 at larger firms. Single was about equal.
- Average single deductible among covered workers in general-deductible plans: $1,886.

**Small-group rate increases for 2026**
- KFF analysis of preliminary filings from 318 insurers: median proposed increase about 11% (12% across 16 states plus DC). Range -5% to +32%. About 10% of insurers asked for 20%+. Source: https://connect.kff.org/proposed-health-insurance-premiums-for-small-group-market-rise-11-for-2026-driven-by-rising-health-care-costs
- Health System Tracker summary of small-business 2026 premiums: https://www.healthsystemtracker.org/brief/how-much-and-why-premiums-are-going-up-for-small-businesses-in-2026/
- Final rates publish late summer or early fall. Use about 10-12% as the 2026 base case and about 7-9% a year after [design].

**Employer contribution norms.** Startups typically pay 80-90% of employee-only premiums and a lower share of dependent tiers [design, consistent with the 84% derived employer share above]. Justworks requires at least 50% of the cheapest employee-only plan and matches dependent tiers to employee-tier contributions. Source: https://help.justworks.com/hc/en-us/articles/360012347512-Custom-Contributions

**PEO pricing (per employee per month, PEPM)**
- Justworks publishes prices: about $79 PEPM for PEO Basic and $124 for PEO Plus (one source says $109; check the live page). No base or setup fee, month-to-month. [unverified: exact current figures]
- TriNet and Rippling PEO are quote-only. A competitor blog estimates $100-300 PEPM for TriNet; treat as a rough, commercially biased guess [unverified].
- Gusto is primarily payroll. Its published plans are about $49-80/mo base plus $6-12 per person. No confirmed PEO rate found [unverified].
- A PEO's small-group rate advantage is real but modest and carrier-dependent. Carriers may require minimum enrollment before coverage activates. Source: https://peo.clicksgeek.com/justworks-peo-minimum-employee-requirements/ [secondary]

**ICHRA and QSEHRA**
- QSEHRA 2026 limits (Rev. Proc. 2025-32, per Mercer and Paylocity summaries): $6,450 self-only, $13,100 family, up from $6,350 and $12,800. Source: https://www.paylocity.com/resources/tax-compliance/alerts/2026-health-fsa-and-other-limits-announced/ . One blog gave $5,850 / $13,050; treat as an error [unverified against IRS text].
- QSEHRA is for employers with fewer than 50 FTEs that do not offer a group plan; limits prorate for mid-year hires.
- ICHRA has no dollar cap and is available to any employer. Use it when a startup wants to avoid a group plan [secondary].

**Dental and vision.** No reliable 2025-26 national figure found in this run. [unverified]. Model as a separate line of roughly $30-80/employee/mo for dental and vision combined [design].

**Waiting periods, COBRA, ACA.**
- ACA employer mandate applies to Applicable Large Employers averaging 50+ FTEs (FTEs = full-time count plus part-time hours / 120). Source: https://www.ifebp.org/detail-pages/news/2025/07/23/irs-releases-adjusted-employer-shared-responsibility-payments-for-2026
- 2026 4980H penalties: $3,340 (a) and $5,010 (b). 2027: $3,780 and $5,670, already published. These bite only above 50 FTEs, so a startup under 50 can skip the mandate [secondary].
- Waiting periods up to 90 days are allowed under ACA. Many startups use 30 days or the first of the month [design].
- COBRA: 18 months for employees of firms with 20+ employees. The employer must notify. Model a departing employee's COBRA as a cost the employee pays, which is a common retention and offer-acceptance issue [design].

**Offer acceptance and retention effects.** I did not find a sourced study in this run [unverified]. Game default: offering a fully paid employee-only plan is table stakes; lacking it lowers offer acceptance for candidates with dependents [design].

## 2. Paid time off

**Access and days (BLS Employee Benefits, March 2025)**
- Paid holidays: 81.0% of private workers have access, average 8 days. Source: https://www.bls.gov/opub/ted/2026/paid-sick-leave-was-available-to-80-percent-of-private-industry-workers-in-2025.htm
- Paid vacation: 80% access. Access in leisure and hospitality is about 46%, and in finance and manufacturing about 96%.
- Vacation after one year: 31% of private workers get 10-14 days. Smaller firms (1-99 employees) average about 10 days after one year; large firms about 14 (March 2024 secondary summary) [unverified for 2025].

**Unlimited PTO**
- Namely 2018: unlimited takers averaged about 13 days vs 15 for limited. Namely 2022: 12.09 vs 11.36 (HR Brew). The gap has flipped and narrowed, and the sample is client data [secondary]. Source: https://www.hr-brew.com/stories/2023/06/08/unlimited-versus-traditional-pto
- Bolt dropped unlimited PTO in July 2025 for a fixed four weeks [secondary].
- Game rule [design]: unlimited PTO does not increase time off. Model usage at roughly 10-13 days/yr, with some rising by burnout pressure.

**PTO liability.** Accrued PTO is a liability on the balance sheet under ASC 710 for policies that vest or pay out. Track it monthly with the close (see the finance file).

**State paid sick leave (secondary; verify with state agencies)**
- California: 40 hours or 5 days minimum for the year (some sources say 80 for larger employers). Accrual 1 hour per 30 worked. Some cities go higher [unverified].
- Colorado: 48 hours per year, 1 hour per 30 worked [secondary].
- Massachusetts: up to 40 hours per year; employer threshold 11 or 12 employees depending on source [unverified].
- Connecticut: phasing toward all employers by 2027, 40-hour cap [secondary].
- New York and Washington have statewide statutes but I found no hour figures in this run [unverified].
- Roughly 17-19 states plus DC have paid sick leave in 2026 (sources disagree). Source for the PTO and sick-leave comparison: https://www.bls.gov/ebs/factsheets/paid-sick-leave.htm

**Paid family and medical leave (state programs).** Employee-funded or shared. New York 2026 employee rate 0.432% of wages, no employer requirement [secondary]. Minnesota launched 1 Jan 2026, split payroll contributions at 0.88% [secondary]. Contribution rates range from about 0.23% (NJ) to about 1.3% (CA) [secondary]. Startups usually pass the employee share through payroll and cover state filings via the PEO or payroll tool [design].

**California final pay.** Labor Code 227.3 treats vested vacation as wages, paid out at separation, and bars use-it-or-lose-it forfeiture. Late final pay can trigger waiting-time penalties of up to 30 days of daily wages (Labor Code 203). Sources: https://consumerattorneys.com/article/labor-code-227-3 and https://www.teambridge.com/compliance/california/vacation-payout [secondary; not legal advice].

## 3. Absence realism

**Sick days.** BLS reports 80% of private workers have paid sick leave access (82% of civilian workers). Plans average about 8 days available after one year. Days available is not days taken. Source: https://www.bls.gov/ebs/factsheets/paid-sick-leave.htm

**Days actually taken.** BLS absence data: 2.2% of full-time workers were absent for illness or injury in an average reference week in 2025, losing about 1.1% of usual worktime. Over 52 weeks that is about 1.1% of 250 workdays, roughly 3 days a year. Secondary HR sources cite about 7 sick days per year for full-time private workers [unverified]. CDC does not publish this per-employee figure in my search results.

**Game distribution [design]:**
- Typical employee: 3-5 short illness days per year (median about 3).
- About 10% of employees: one 1-2 week illness per year.
- About 1-2% of employees: a multi-week or intermittent medical leave per year. Model these as lumpy events, not spread out.
- Burnout or mental health leave: roughly 2-4% of employees per year, often unplanned and sometimes longer. [unverified]

**FMLA.** Covered employers have 50+ employees within 75 miles. Eligible employees need 12 months of service and 1,250 hours in the prior 12 months. Up to 12 weeks unpaid, job-protected. Remote workers count at the office they report to. Sources: https://webapps.dol.gov/elaws/whd/fmla/6i.aspx and https://www.hunton.com/hunton-employment-labor-perspectives/telecommuting-employees-entitled-to-fmla-if-office-to-which-they-report-meets-50-or-more-employee-threshold . A solo or small-team startup under 50 is exempt, but the founder should still plan for leave.

**Short-term disability.** Access figures are only regional in my results (West: 36% of private workers). National 2025 figure not found [unverified]. Model STD as optional, employee-paid, and only in a benefits package above about 20 staff [design].

**Coverage gaps on a tiny team (game mechanic [design]).**
- Each absence day adds 1 day of backlog for the team. Two-person teams lose about 50% of capacity when one is out.
- Key-person risk: an unplanned 2-week absence on the only engineer or support person pushes shipping or support SLAs by 1-2 weeks.
- Cover with documented runbooks and a contractor on call. Founders who skip this should see slower delivery and burnout later.

**Bereavement and jury duty.** Bereavement is typically 3-5 paid days, and jury duty is usually paid for 1-2 weeks by the employer in many states, though not all [unverified]. Check state rules. Federal law does not require paid jury duty, but most states prohibit firing for it.

## 4. Other benefits

**401(k) with match and pricing.** Guideline (now "Gusto 401k powered by Guideline" after a Nov 2025 acquisition) lists a base fee of about $49/mo plus $6 per active participant (third-party). Human Interest lists $80-120/mo plus $4-7 per eligible employee across sources. Sources conflict; quote both [unverified]. Typical safe-harbor match: 3-4% [design].

**Stipends.** Home office $50-100/mo, learning $500-1,500/yr, wellness $25-75/mo are common ranges [design, not sourced].

**Equity refresh.** Common for employees after 12-24 months of vesting; sized to keep up with the option pool and 409A (see the hiring file) [design].

**Total benefits load.** BLS September 2025 citation (secondary): benefits are about 29.7% of total employer compensation costs per hour for civilian workers [unverified]. Model startup benefits at 25-30% of salary, plus the health premium above [design].

## 5. International and EOR notes

- **EOR fees.** Vendor blogs cite list fees of about $459-699 per employee per month, with negotiated 20+ seat deals around $400-525. Currency markups of 0.5-2% and deposits of 1-2 months' gross pay are common. Supplemental benefits often carry 10-20% admin markup. All-in run-rate can run 15-35% above list [secondary; vendor-sourced; verify with quotes].
- **EU.** The Working Time Directive (2003/88/EC) sets a minimum of 4 weeks (about 20 days for a 5-day week) paid annual leave. Country rules add more, for example 25-30 days in several states [from memory, not verified in this run].
- **Mexico.** The 2023 reform raised minimum vacation to 12 working days after one year, rising to 20 by year five, plus 2 days every five years after [secondary: Roedl, Greenberg Traurig, L&E Global]. Source: https://www.roedl.com/insights/mexico-labour-reform-2023-mandatory-minimum-vacation
- **Philippines.** Mandatory 13th-month pay (one-twelfth of basic salary, by 24 December) under PD 851 [from memory, not verified in this run]. Model it as a cost line in the payroll of each Philippines hire.
- **Other LatAm.** Brazil and others have their own thirteenth-salary and severance rules [unverified]. Use EOR quotes for statutory totals.

## Key gaps

- Dental and vision premium data, STD national access, 2025 offer-acceptance research, and NY and WA sick-leave hours all remain unverified.
- The QSEHRA figures should be checked against the IRS revenue procedure text before publishing.
- Health premium and PEO prices change each year; refresh at each game-year start.
