# O4: Finance, legal, hiring and people operators (2026, small startups)

Research date: 2026-10-14. Search quality was uneven. Most hard numbers below came from vendor blogs or secondary aggregators, and several sources contradict each other. Each number carries a URL and, where I could find one, a date. Labels: [design] = my estimate for simulator tuning; [unverified] = secondary or vendor claim I could not check against the primary document.

Legend for sources:
- S1 Bridge Group 2025 SDR report: https://www.bridgegroupinc.com/research/2025-sdr-models-metrics-report-the-bridge-group
- S2 Ebsta/Pavilion 2025 GTM Benchmarks: https://benchmarks.ebsta.com/2025-gtm-benchmarks
- S3 Recurly, April 30 2026, failed payment recovery: https://recurly.com/blog/failed-payment-recovery-data-based-strategy/
- S4 Yuno, measuring failed-payment recovery: https://y.uno/en/blog/how-to-actually-measure-failed-payment-recovery.md
- S5 Redux Payments, Stripe dunning in 2025: https://www.reduxpayments.com/blog-post/what-stripe-dunning-misses-in-2025-and-how-to-recover-more
- S6 Consero 2025 Finance Leaders Survey, as cited in Ledge/ChatFin coverage: https://www.ledge.co/content/month-end-close-benchmarks-for-2025
- S7 Maxio, best-in-class SaaS close: https://www.maxio.com/blog/what-best-in-class-month-end-close-looks-like-in-saas
- S8 Carta 83(b) guide: https://carta.com/learn/equity/stock-options/taxes/83b-election/
- S9 Harness 83(b) explainer: https://www.harness.co/articles/the-83-b-election-explained-why-timing-matters-for-founders-and-early-employees
- S10 Drata SOC 2 cost and timeline: https://drata.com/learn/soc-2/cost
- S11 Gem 2025 Recruiting Benchmarks (PDF, figures only via secondary coverage): https://lp.gem.com/rs/972-IVV-330/images/2025 Recruiting Benchmarks - Gem.pdf?version=0
- S12 Schmidt, Oh and Shaffer 2016 validity update (coefficients via secondary table): https://stafforini.com/works/schmidt-2016-validity-and-utility/
- S13 Gallup feedback findings as cited by 100hires: https://100hires.com/employee-feedback-statistics.html
- S14 Lattice cadence analysis: https://lattice.com/articles/how-does-survey-review-and-goal-cadence-affect-engagement
- S15 Bessemer State of the Cloud, burn multiple, as cited by VCBeast and a secondary blog: https://vcbeast.com/benchmarks/saas-metrics (unverified, not primary)

Coverage gap: I found no primary quartile data for SaaS runway, forecast accuracy, ramp time for new sellers or seed-stage sourcing response rates. Those rows are [design] and should be treated as tuning guesses.

---

## 1. Cash management, runway and forecasting

### 1. Tier behaviours
- **Stellar:** Maintains a 13-week cash forecast, updated weekly, with named line items (payroll dates, card-processor payouts, annual prepay timing, tax dates). Tracks a rolling "months of runway at current net burn" and a second number at planned hires. Sets a hard floor (e.g., 6 months) that triggers a pre-set action (cut discretionary spend, start a raise, or pause hiring) before the floor is breached. Models two or three scenarios (base, churn shock, and a 20% revenue miss) and writes down which costs would be cut in each. Asks "what is the burn multiple and is it getting worse?" before approving any hire.
- **Good:** Has a forecast in a spreadsheet and updates it monthly. Knows the runway number and the date it falls on. Separates committed from discretionary spend. Waits until about 9 months of runway to think about a raise.
- **Average:** Looks at the bank balance when wondering about cash. Forecasts by extending last month's expenses. Counts deferred revenue or unpaid invoices as cash. Does not track net burn trend.
- **Mediocre:** Does not know the monthly net burn to the nearest $5k. Plans the next hire on the assumption the next round closes. Raises at under 6 months of runway. Mixes annual prepayments into MRR-based runway.

### 2. Outcome spreads
- Runway at the moment of a raise: stellar founders raise with 9+ months left and close in weeks; mediocre founders start at under 6 months and lose negotiating leverage. [design] Source for the pattern: none found. Treat as tuning value.
- Burn multiple (net burn / net new ARR), secondhand: top quartile under 1x, median 1–2x, bottom above 3x. [unverified] S15, date not given.
- Forecast error: stellar within ±10% on 3-month cash, average ±25%, mediocre ±40% or worse. [design]

Skill vs luck: Forecast accuracy and the timing of raises are mostly skill. Round availability and market closures are luck or context. The simulator should weight the decision (when to start a raise) more than the outcome of one raise.

### 3. Mediocre-operator traps
- **Counting unbilled or deferred revenue as cash.** Looks healthy for months, then a cash cliff arrives on a payroll date.
- **Hiring against forecast growth.** Each hire is justified by the growth plan, and when growth slips, burn is locked in.
- **Waiting for the next round to fix cash.** Leaves the cut decision until under 4 months, when every option is worse.
- **Chasing a low burn number.** Cutting marketing that has positive payback and keeping tooling that has no owner.

### 4. Detection
- Presence of a forecast file or tool, its update cadence (timestamps or version history), and whether it includes payroll dates.
- Whether the player answers a runway question with a number and a date, or with "a while".
- Decision timing: does the player propose a cut or raise trigger in advance (e.g., "if runway drops below 6 months I will...") rather than after the fact?
- Hard to game: consistency between forecast and later bank balance. A player who claims 14 months should have a forecast that reconciles with the simulated bank statements.

### 5. Feedback
- Stellar to mediocre: "Your runway counts receivables that have not been paid. Remove them and tell me the real date."
- "You hired before the plan was proven. Make each hire conditional on a metric you can name."
- "You started the raise at 5 months. Start at 9, and have a cut plan ready so you are not forced."

### 6. Sources
S15 (burn multiple, unverified). No primary runway quartile source found. Other numbers are [design].

---

## 2. Bookkeeping, monthly close, taxes and compliance deadlines

### 1. Tier behaviours
- **Stellar:** Uses a chart of accounts with deferred revenue as a separate line. Has a close checklist with owners and due days (bank reconciliation, revenue schedule, accruals, card reconciliation, sales tax). Closes the books within about 5 business days and reviews the P&L against the budget. Keeps a compliance calendar that lists Delaware franchise tax (March 1), federal and state estimated taxes, 1099 filings (January 31), sales tax registrations and payroll filings, and assigns a reminder to each. Hires an outside bookkeeper or accountant before the first filing deadline, not after.
- **Good:** Uses an outsourced bookkeeper with monthly reconciliation. Knows the big deadlines but keeps them in a shared calendar, not a checklist. Closes in about 10 business days.
- **Average:** Books are caught up at tax time. Revenue is recognised when cash arrives. Uses the bank feed without reconciling. Discovers sales-tax nexus only after a state letter.
- **Mediocre:** Has missed a state filing and paid a penalty. Mixes personal and business cards. Does not know whether the company is in good standing in Delaware. Books are more than 60 days behind.

### 2. Outcome spreads
- Close time: Consero's 2025 survey, via Ledge/ChatFin coverage, says only 7% of companies close in under 3 days, and 62% close within 9 days (up from 8% in 2024). [unverified] S6, date 2025.
- Vendor target for SaaS: most set a 5-day close, top teams 3 days. [unverified, vendor aspiration] S7.
- Older APQC benchmark (2018, dated): top quartile closes in 4.8 days or less, bottom quartile in 10+ days. Cited via Orb; I could not open the primary. [unverified]
- Penalty exposure: late or missed filings cost money. Delaware franchise tax and state annual reports are a common surprise. [design] for the simulator's penalty model.

Skill vs luck: Close speed and filing on time are almost entirely skill and process. Audits and state notices are context.

### 3. Mediocre-operator traps
- **Revenue recognised at cash receipt on annual plans.** Looks like a strong month, then a restatement or a tax surprise.
- **Relying on the bank feed as the books.** Missing accruals (unpaid vendor bills, unbilled usage) make the margin look good until the year-end.
- **Assuming "no revenue, no tax."** Sales tax and nexus rules can apply to SaaS from the first sale in some states.
- **Deadlines held in one person's head.** A missed Delaware filing turns into a status problem that can block banking and fundraising.

### 4. Detection
- Whether the player mentions a close checklist, an owner, and a due day.
- Whether deferred revenue is mentioned when the player describes annual plans.
- Whether the calendar includes the dates in section 1 and whether reminders were set in advance.
- Can't easily be gamed: the simulator can check whether the player files on time over several simulated years, and whether the books reconcile to the bank.

### 5. Feedback
- "Your revenue is recognised when cash arrives. Put annual prepay into deferred revenue and recognise it monthly."
- "You learned about the Delaware bill from a letter. Put March 1 on the calendar with an owner and a reminder 60 days before."
- "Your close takes 3 weeks. Write the checklist once, assign owners, and aim for 5 days."

### 6. Sources
S6 (close speed, unverified secondary), S7 (SaaS target, vendor), S10 for the compliance cost context. Filing dates are [design] and should be checked against state and IRS calendars before tuning.

---

## 3. Payments, billing and dunning operations

### 1. Tier behaviours
- **Stellar:** Turns on automatic retries and a multi-step dunning sequence (email, in-app notice, card update link, then a pause or downgrade) with timing set to the card decline reasons. Uses the card updater where available. Tracks recovery by cohort and by decline reason. Reviews involuntary churn monthly as its own line in the MRR bridge. Sends dunning emails from a person's name and a support address, and makes the payment page fast to update.
- **Good:** Uses the processor default retry schedule and one dunning email. Looks at failed-payment counts monthly.
- **Average:** Retries are on, but nobody tracks the recovery rate. Dunning emails are generic and sent once. Failed payments are treated as churn only when the customer cancels.
- **Mediocre:** Customers who fail payment are never contacted. Involuntary churn is counted as voluntary. Pricing or invoice errors create repeated failures that nobody investigates.

### 2. Outcome spreads
- Recovery of failed payments, 2025 secondhand: a median around 47.6%, attributed to Recurly by Slicker and Orb [unverified, S3 cites a different framing]. Recurly's April 30 2026 post says optimised retries lifted recovery in its enterprise data from about 53% to 71%. [S3, dated 2026-04-30]
- Layered programs: top performers 70–85% (Yuno, S4, date not stated). [unverified]
- Stripe Billing: Stripe's own headline figure is cited as 55% average recovery, with Smart Retries adding about 9% revenue versus a fixed schedule. [unverified, cited via secondary sites: S5 and others]
- B2C audit of 200+ Stripe Billing accounts by a vendor: 25–35% recovery. [unverified, vendor B2C data, S5]
- Involuntary churn share of total churn: 20–40% (secondary, unverified). Treat as a plausible range for the simulator, not a benchmark.
- Recovery metric definitions differ (volume-weighted vs invoice count, 7-day vs 45-day window). The simulator should compare like with like. [S4]

Skill vs luck: Card decline mix and customer card expiry are context. Retry schedule, dunning messaging, and card-update UX are skill.

### 3. Mediocre-operator traps
- **Dunning with one email at day 0.** Recovers little and makes the customer feel blamed.
- **Retrying the same failed card on the same schedule.** Smart retry logic exists for this reason.
- **Counting involuntary churn as "customer decided to leave".** Hides the lever that the operator controls.
- **Discounting to win back a customer whose card failed.** Trains customers to fail on purpose.

### 4. Detection
- Presence of dunning email sequence in the player's configuration or copy, with timing in days.
- Whether the player asks for the decline reason, not just the count.
- Whether recovery is tracked as a metric and whether it appears in the player's reports.
- Hard to game: recovery curves in the simulator should respond to real retry and reminder choices with noise, so a player cannot tune the copy in isolation.

### 5. Feedback
- "You send one email and wait. Send four over 14 days, with a card-update link in each."
- "Involuntary churn is 25% of your churn. That is a product and billing problem you can fix this month."
- "Measure recovery by cohort and by decline code, not only in aggregate."

### 6. Sources
S3, S4, S5 and the secondary figures above (all dated where stated). The Stripe default of 8 tries within 2 weeks is secondary [unverified]. Verify against Stripe Billing docs before tuning.

---

## 4. Legal hygiene (entity, IP, contracts, 83(b), privacy, SOC 2 timing)

### 1. Tier behaviours
- **Stellar:** Forms the Delaware C-corp (or the chosen entity) before the first customer or first code commit, and assigns IP from the founders to the company in writing. Files the 83(b) within 30 days of stock issuance and keeps the proof. Signs a customer MSA and DPA template before the first paid customer, and keeps the privacy policy aligned with what the product actually collects. Starts SOC 2 Type 1 before enterprise sales cycles need it, and runs Type 1 then Type 2 with a clear observation window. Keeps a board-ready list of contracts, expirations and IP assignments.
- **Good:** Uses an incorporation service and a standard founder agreement. Knows the 83(b) deadline but files late or with help. Has a generic ToS and privacy policy. Starts SOC 2 when the first large prospect asks.
- **Average:** Entity and IP handled by template with no review. Customer contracts are click-through only. Contractors sign nothing or a one-line NDA. SOC 2 is discovered in a sales call.
- **Mediocre:** Does not know the 83(b) rule. Code written before incorporation is owned by a person, not the company. Privacy policy describes a product that no longer exists. Signs an enterprise DPA without reading the subprocessors list.

### 2. Outcome spreads
- 83(b) timing: 30 days from issuance (Carta guidance). [S8, date not given in search output] The trigger date is debated. Harness says the Treasury regulation ties the deadline to transfer, so the safer assumption is the earlier date. [S9]. A missed 83(b) cannot be fixed later. Outcome spread is binary: filed on time or taxed on vesting at a higher value. [design]
- SOC 2 timeline (vendor claim, Drata): Type 1 3–6 months; Type 2 6–15 months with a 3–12 month observation period. [unverified, S10]
- SOC 2 cost (vendor range): Type 1 about $7,500–$15,000 audit fee for small companies; Type 2 $12,000+; first-year all-in $25k–$150k depending on approach. [unverified, S10 and secondary]
- Enterprise deal losses without SOC 2: [design] estimate. No source found.

Skill vs luck: Timing mistakes are skill. Whether a customer demands SOC 2 by a specific date is context.

### 3. Mediocre-operator traps
- **Founders not assigning IP to the company.** Causes a cap-table or acquisition problem years later.
- **Missing the 83(b) and assuming it's optional.** Irreversible.
- **Starting SOC 2 during a deal.** Adds months to the sales cycle and the audit is more expensive if controls are added in a rush.
- **Using a DPA template without checking the subprocessor list.** Creates a privacy claim the company cannot honour.

### 4. Detection
- Whether the player mentions the entity, IP assignment, and the 83(b) before the first customer or first hire.
- Whether the timeline of 83(b) filing falls within 30 days of the simulated issuance date.
- Whether contracts are signed by customers and contractors, and whether a DPA exists before enterprise sales.
- Hard to game: the simulator can check dates in the player's own record. Claims like "we have a lawyer" should be tested with a document request.

### 5. Feedback
- "Get the IP assignment signed before you take any money. Future investors will ask for it."
- "The 83(b) is 30 days from issuance. You are on day 29. File today or accept the risk."
- "Start SOC 2 when your first deal asks for it, so you are not doing it in a deal."

### 6. Sources
S8, S9 (83(b)); S10 (SOC 2, vendor). Not legal advice; the simulator should state that a qualified lawyer is needed for real cases.

---

## 5. Hiring (sourcing, interviewing, closing candidates)

### 1. Tier behaviours
- **Stellar:** Writes a role scorecard with 3–5 outcomes and a work sample before the first interview. Sources from referrals and a named target list, not only job boards. Runs a structured interview loop with the same questions for each candidate and written scoring anchors. Calls references and asks "what would make you not hire this person again?". Makes an offer within 48 hours of the final interview and tells the candidate why they are the choice. Keeps a record of why candidates declined.
- **Good:** Has a job description and asks the same questions most of the time. Uses one or two job boards plus referrals. Calls one reference.
- **Average:** Hiring is driven by the next urgent gap. Interview questions are whatever comes to mind. Offer takes about 2 weeks. Uses a recruiter by default.
- **Mediocre:** Hires the most likeable candidate. Skips references. Makes offers verbally and then renegotiates. Pays a retained recruiter fee for a role that could have been filled by a referral.

### 2. Outcome spreads
- Offer acceptance: 84% in Gem's 2025 benchmarks (up from 81% in 2021), via secondary coverage. [unverified, S11]. A secondary roundup cites 82% for a "Gem 2026" report I could not verify. [unverified]
- Time to hire: 41 days average in 2024, up from 33 in 2021 (secondary citing Gem). [unverified, S11]. Engineering roles reportedly longer. [unverified]
- Predictive validity of selection methods (Schmidt, Oh and Shaffer 2016, via secondary table): structured interview about 0.51, work sample 0.48, unstructured interview about 0.38. Sackett et al. (2021) revision reportedly gives structured 0.42 and work sample 0.33. [unverified, S12]. The ranking is stable: structured and work samples beat unstructured. The exact coefficients are not stable.
- Sourcing response rate: I found no reliable benchmark. Gem's PDF should be checked. [unverified]
- Stellar vs mediocre hire quality: [design] stellar hires ramp in about 2 quarters and stay; mediocre hires are replaced within 12 months. No source found.

Skill vs luck: Structure and work samples are skill. Candidate market and offer acceptance are partly context.

### 3. Mediocre-operator traps
- **Unstructured "culture fit" interviews.** Weak validity, and easy to bias.
- **Recruiter-first sourcing.** Expensive, and the list is the same as everyone else's.
- **Verbal offers and renegotiation.** Burns trust and time.
- **Hiring before the role is defined.** Produces a mismatch in six months.

### 4. Detection
- Whether the player writes a scorecard or outcomes before posting the role.
- Whether interview questions are structured and whether scoring anchors are used.
- Whether the player calls references, and whether the reference questions are specific.
- Timing from final interview to offer.
- Hard to game: candidate quality signals from work samples. Players can read a rubric but cannot easily fake a work sample that the simulator scores.

### 5. Feedback
- "You hired because they were likeable. Write three outcomes for the role and score every candidate against them."
- "Your offer took 12 days. Make the decision in 48 hours and send the offer the same day."
- "Call two references and ask what would make them not hire this person."

### 6. Sources
S11 (Gem, unverified secondary), S12 (Schmidt/Oh/Shaffer 2016, unverified coefficients). Other numbers [design].

---

## 6. Managing people and contractors (onboarding, feedback, performance, firing)

### 1. Tier behaviours
- **Stellar:** Writes a 30/60/90 plan with 3 measurable outcomes before day 1. Has a weekly one-on-one with a fixed agenda (what is blocked, what you need from me, what you are learning). Gives specific, timely feedback, and gives a written note each quarter. Addresses performance gaps within two weeks of noticing, with a specific example and a written expectation. For contractors: writes a statement of work with deliverables and acceptance criteria, pays on milestones, and checks worker classification (control, exclusivity, duration). Firing: documents issues, gives a clear last chance when warranted, and moves fast when it is not working.
- **Good:** Has one-on-ones and an onboarding doc. Gives feedback at review time. Waits one or two quarters before addressing performance issues. Contractors are on hourly invoices with a rough scope.
- **Average:** Onboarding is "here's the Slack channel". Feedback is positive by default. Performance problems are discussed with the person's manager, not the person. Contractors are used as employees for months.
- **Mediocre:** No one-on-ones. Feedback arrives through a third party. A problem employee is kept for a year. Contractors are misclassified and told they are "part of the family".

### 2. Outcome spreads
- Feedback frequency and engagement: Gallup 2019 reported that nearly half of employees get feedback a few times a year or less. Weekly feedback was associated with being 2.7x more likely to be engaged than annual feedback. [unverified, S13, date 2019]
- Gallup 2024 (with Workhuman, via secondary): 27% of employees want feedback at least weekly. [unverified, S13]. This suggests the stellar manager gives more than employees ask for, which is fine. [design]
- Review cadence (Lattice, 2021 survey of 1,200 professionals; vendor analysis): semi-annual reviews linked to higher engagement than annual; quarterly higher still. [unverified, S14, dated 2021]
- Lattice 2024 analysis: average number of review cycles rose from 2.0 in 2020 to 2.6 in 2023; eNPS fell from 33.3 (2022) to 24.8 (2023). [unverified, S14]
- Contractor misclassification risk: [design] not quantified here.

Skill vs luck: Feedback quality and firing decisions are skill. Market and team fit are context.

### 3. Mediocre-operator traps
- **Avoiding the hard conversation for a year.** The problem becomes the team's problem, and the best people leave.
- **Positive-only feedback.** The person learns nothing, and the first negative review feels like a surprise.
- **Hiring a contractor as a disguised employee.** Creates classification risk and a tax issue.
- **Firing without documentation.** Makes a later dispute much harder.

### 4. Detection
- Whether the player writes a 30/60/90 plan and measurable outcomes.
- The cadence of one-on-ones and written feedback in the simulated timeline.
- Whether performance issues are raised with a dated example and a written expectation.
- For contractors: presence of an SOW with acceptance criteria, and whether the simulated worker has set hours or a manager (a classification risk signal).
- Hard to game: the simulator can compare the feedback the player says they gave with the team member's simulated engagement and retention.

### 5. Feedback
- "You have not raised this with the person in four months. Name the specific example and the change you need by a date."
- "Put the contractor on a milestone SOW. If they work set hours for you, they are an employee in the eyes of the state."
- "Document the performance issue before you decide to fire. Write what you saw, what you asked, and what changed."

### 6. Sources
S13 and S14 (feedback and cadence, unverified secondary). Other items [design].
