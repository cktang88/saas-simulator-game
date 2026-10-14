# HR, legal/compliance and product development for solo SaaS founders (research as of 2026-10-14)

Scope: what a solo founder (bootstrapped/indie or VC-backed) actually does in 2026 about hiring, AI "employees", payroll, entity and legal work, compliance, and building product with AI coding agents. The numbers here feed the simulator's parameters. They are the most specific I could source.

**How to read the confidence notes**
- **[P]**: primary source (government, regulator, the vendor's own page or the study itself).
- **[S]**: secondary source (law-firm alert, vendor comparison blog, aggregator). Several of these are vendors or competitors with an interest in the numbers.
- **[A]**: a game-design assumption I derived from the sources. It is not a measured statistic. Do not present [A] values to players as facts.
- Prices change often. Every price carries the month it was checked. Before quoting a number outside the game, check the vendor's page.

---

## 1. HR in 2026: AI agents, contractors, employees, payroll and equity

### 1.1 What AI agents can replace (and what they cost)

| Role | 2026 AI option | Cost model | What it really handles | Where it fails |
|---|---|---|---|---|
| Tier-1 support | Intercom Fin and similar tools (Zendesk AI, Decagon, Sierra, plus home-made agents on an LLM API) | **$0.99 per resolution**. Several sources report a 50-resolution monthly minimum outside Intercom's helpdesk [S, 2026]. | Intercom claims a ~67% resolution rate across 40M+ conversations. That is the vendor's own figure; I found no independent check [S, 2026]. A "resolution" includes conversations where the customer simply stopped replying, so the real rate is lower. | Billing disputes, bugs that need an engineer, angry or churn-risk customers, anything missing from the docs. Quality depends on how good the help-center content is. |
| SDR / outbound | AI SDRs such as 11x and Artisan | 11x: about $3,750–$5,000 per month on annual contracts (~$45–60k/yr). Artisan: old list prices were $250–$600/mo; reported deals run $1.5–5k/mo [S, competitor-written, 2026]. | High-volume personalized first-touch email and list building. | TechCrunch (Mar 2025) reported 70–80% churn in early 11x cohorts, which 11x disputed. Artisan's CEO acknowledged high churn and hallucinations in first-generation AI SDRs. The agents handle replies poorly, and deliverability and domain reputation still need a human [S]. |
| Coding | Claude Code, Cursor, Codex-style agents | Claude Pro $20/mo; Max $100 or $200/mo. Cursor Pro $20, Pro+ $60, Ultra $200 [S, 2026]. API usage can run higher. | Most of the code at many new startups: in March 2025 YC said ~25% of its W25 companies had codebases that were about 95% AI-generated [P: TechCrunch, 2025-03-06]. | Measured speedups are much smaller than people perceive (§3.1). Security flaws, outages, architecture drift. A human still owns review, product judgment and on-call. |
| Bookkeeping / ops | AI bookkeeping (Pilot, Digits and others) plus a human CPA at year end | $0–$500/mo [A] | Categorization and reconciliation | Taxes, R&D credits, 409A inputs and state filings still need a professional. |

**Game rule [A].** An AI agent is a cheap, always-on, high-volume worker with a quality ceiling. Model each one as (capability %, error rate, founder-oversight hours/week). It is not a free employee.

### 1.2 Contractor vs employee (misclassification)

- **US federal (FLSA).** In May 2025 the DOL stopped enforcing the 2024 six-factor rule. On 2026-02-26 it proposed rescinding it and returning to a 2021-style test whose core factors are *control* and *opportunity for profit or loss*. Comments closed 2026-04-28, and I found no final rule as of this research [S: K&L Gates, DLA Piper, Akin, 2026]. The IRS common-law test and stricter **state tests (California ABC test)** still apply, so misclassification risk did not go away.
- **Red flags for misclassification:** set hours, a single client, the founder directs *how* the work is done, ongoing core work, company equipment, a contractor working on an open-ended basis like a staff member.
- **1099-NEC reporting threshold** rose from $600 to **$2,000 for payments made in 2026** (OBBBA §70433), indexed from 2027 [S: Patriot, OnPay, 2026].
- **Noncompetes.** The FTC's 2024 noncompete ban is dead. The FTC dropped its appeals on 2025-09-05 and the court's vacatur stands [S: FTC, Paul Weiss, 2025]. State law governs; California voids most noncompetes. Use confidentiality and IP assignment instead.
- **EU hiring.** The EU Pay Transparency Directive's transposition deadline was **2026-06-07**. Only a few states (for example Italy, Slovakia, Lithuania, Malta) had transposed on time, but where it applies employers must state the pay range before the interview and cannot ask about salary history [S: Lockton 2026-09, Remote Work Europe].

### 1.3 Payroll and EOR fees (checked 2026)

| Provider | Product | Price | Note |
|---|---|---|---|
| Gusto | Simple | **$49/mo + $6/person** (base rose from $40 on 2026-03-01 per Sonary; some pages still show $40) | Plus is $80 + $12/person; Premium $180 + $22/person; Contractor-only $35 + $6/contractor [S, 2026] |
| Deel | Contractor management | **$49/contractor/mo** | Contractor of Record (shifts misclassification risk to Deel) is ~$325/mo [S, 2026] |
| Deel | EOR | **$599/employee/mo** (Enterprise $899; one source reports ~$499 on annual billing) | Country employer costs add **13–40%** on top of gross pay [S, 2026] |
| Remote.com | Contractor / EOR | $29/contractor/mo; EOR $599 (annual) to $699 (monthly) | [S, 2026] |
| Oyster | EOR | ~$699/mo; ~$499 on annual billing per one source | [S, 2026] |
| Rippling | EOR | ~$499–599/employee/mo plus a platform base (unverified) | [S, 2026] |

### 1.4 Employer burden

- **BLS ECEC, June 2026 (released 2026-09-09):** benefits are 30.0% of total compensation for private-industry workers and 31.5% for full-time workers. Benefits ≈ **43–46% on top of wages** in the national average [P: BLS]. The figure includes paid leave, insurance, retirement and legally required benefits.
- A lean startup paying health insurance and payroll taxes but no 401(k) match typically runs **20–30% on top of base** [A, consistent with BLS legally-required plus insurance components]. Use **1.25×** base as the indie default and **1.30–1.40×** for a VC startup with richer benefits.
- International EOR adds a 13–40% statutory load on top of salary, plus the platform fee [S].

### 1.5 Salaries (2025–2026)

| Role | US (early-stage) | Remote international | Source / confidence |
|---|---|---|---|
| Founding / senior engineer | **$140k–$200k base** at seed; posting median ~$195k. Carta's average new-hire engineering salary was ~$189k (June 2025, all stages). | LATAM senior $55k–$110k; Eastern Europe $45k–$120k; India $35k–$47k (placement data). Contract rates: LATAM $45–65/hr, Eastern Europe $50–75/hr, India $33–45/hr | Carta H1 2025 [P]; recruiter blogs [S]; Lemon.io and Wisemonk 2026 [S, vendors] |
| Product designer | ~$105k–$145k (BLS web/digital designer median $104k; Levels.fyi Series B median TC $143k) | ~35–60% of US [A] | BLS OEWS 2025 [P]; Levels.fyi 2026 [S] |
| Account executive | Median OTE **$190k**, 53:47 base:variable split, $800k quota (2024) | ~40–70% of US [A] | Bridge Group 2024 [P] |
| SDR | Median OTE $80k, 68:32 split (Feb 2025) | — | Bridge Group 2025 [P] |
| Customer support | ~$45k–$65k (SaaS median ~$55k; BLS CSR median $44,770) | Philippines/LATAM support ~$12k–$30k [A] | Founderpath 2026 [S]; BLS OEWS 2025 [P] |

Other signals:
- Median seed team size is about **4 employees** [S: Carta H2 2025].
- Entry-level engineering hires fell from 19.2% to 13.9% of software-engineering hires between Q4 2023 and Q3 2025 [S: Pave].
- AI/ML engineer salaries are rising fastest: +9.1% at startups valued at $1–10M [P: Carta].

### 1.6 Time-to-hire, ramp, equity, 409A, pools

- **Time-to-hire:** median ~40 days for technical roles and ~30 for business roles, per a secondary summary of Ashby's 2026 data (unverified) [S]. There are now 300+ applications per hire [S: Ashby press, May 2026]. For a founder recruiting part-time, model **4–10 weeks** [A].
- **Ramp:** AE ramp averages **6.2 months**, the highest in the history of the study (Bridge Group 2026, 158 companies) [P]. Earlier figures were 4.7–5.0 months. Engineers take 3–6 months to fully ramp; well-documented teams can reach productivity in 4–6 weeks [S: Lethain, Flow]. AI agents need roughly zero ramp but need prompts, docs and evaluation setup (1–2 weeks of founder time) [A].
- **Equity for first hires:** first engineer is ~0.5%–2% at seed. Reported averages are ~1.5% for the first technical hire (attributed to Carta, unverified) and ~1% (Pave, unverified), falling to ~0.3% by hire #5 [S]. Standard terms are 4-year vesting with a 1-year cliff.
- **Option pool:** **~10–15% post-seed** (Carta-cited seed median 12–13.5%) [S]. VCs often require the pool to be refreshed before a priced round, which dilutes the founders.
- **409A:** required before granting options (IRC §409A safe harbor). Early stage costs **$1k–$5k**, and Pulley/Carta bundles exist [S: Pulley blog]. Refresh every 12 months or after a material event.
- **Severance:** I found no 2025 startup median. Market practice ranges from 2–4 weeks (small startups) to 8+ weeks, and big tech gave 16–20 weeks in 2025 [S: layoffs.fyi 2020; press 2025]. Game value: **2–8 weeks of pay plus COBRA support**, with a release agreement [A].
- **Burnout:** Sifted (Feb 2025, n=138) found over half of founders reported burnout in the past year and 75% anxiety. MaRS (2025) found burnout in 65% of women founders vs 42% of men [S].

---

## 2. Legal and compliance

### 2.1 Entity and incorporation

| Path | Typical entity | Why |
|---|---|---|
| VC-backed | **Delaware C-corp** | Investors and SAFEs expect it. **QSBS (§1202) after OBBBA:** for stock issued after 2025-07-04, the exclusion cap is $15M (or 10× basis), the gross-asset limit is $75M, and holding is tiered at 3/4/5 years (50/75/100% per common summaries; verify) [S]. |
| Indie / bootstrapped, US founder | LLC (home state or Wyoming/Delaware), or a C-corp if a raise or exit is plausible | Pass-through taxation and simplicity. Conversion later costs legal fees. |
| Non-US founder selling to the US | Delaware C-corp via Atlas/Firstbase, or an LLC via Doola | Access to Stripe and a US bank |

**Formation services (2026):**
- Stripe Atlas: **$500** one-time, then $100/yr registered agent.
- Clerky: $427 pay-per-use or $819 lifetime.
- Firstbase: $399 + $99/yr.
- Doola: from $297/yr; tiers with bookkeeping run $1.6k–2.4k/yr [S: Rho, Flowjam 2026].

**Delaware fees (2026):**
- Corporate franchise tax minimum is unchanged: $175 (authorized-shares method) or $400 (assumed-par method). Avoid the authorized-shares surprise bill by filing on the assumed-par method.
- The LLC annual tax rises from $300 to **$400** for tax year 2026 (HB 400).
- Many Secretary of State fees rose on 2026-08-01 [S: InCorp, Maples, Discern 2026].

**Tax:** OBBBA restored immediate expensing of domestic R&D, including software development (new §174A), for tax years beginning after 2024. Foreign R&D is still amortized over 15 years, which matters if your engineers are abroad [S].

### 2.2 Founder stock, vesting, 83(b), IP

- Founders buy restricted stock at par, usually on a 4-year vesting schedule with a 1-year cliff. Investors may accept credit for time already worked. Use double-trigger acceleration if any.
- **83(b):** file within **30 days** of the grant, with no exceptions.
  - Since July 2025 the IRS accepts **online filing of Form 15620** through an IRS online account (ID.me sign-in), with immediate confirmation. Electronic filing works *only* with Form 15620, and mail is still allowed [S: MoFo, Goodwin, Alston 2025].
  - Give a copy to the company.
  - Cost: $0 to DIY; Atlas and Clerky include it.
- **IP:** every founder signs a technology/IP assignment to the company. Every employee and contractor signs a **CIIAA** (Confidential Information and Invention Assignment Agreement) *before* work starts. California Labor Code §2870 carve-outs apply.
  - Contractor agreements need a present-tense assignment ("hereby assigns").
  - For AI-generated code, the US Copyright Office's position (2025 report) is that purely AI-generated material is not copyrightable without sufficient human authorship. Trade secrets and contracts protect the business more than copyright does.

### 2.3 ToS, privacy, DPAs, privacy law

- **ToS and privacy policy:** generators cost $0–$25/mo. Termly is roughly $10–20/site/mo with a free tier; iubenda starts around €5/mo and its Advanced tier is ~$25/mo [S, 2026]. Have a lawyer review the B2B terms (~$1.5k–$5k) once revenue justifies it [A].
- **GDPR / UK GDPR basics:**
  - Lawful basis for each processing purpose.
  - Privacy notice.
  - Records of processing.
  - DPAs with all subprocessors and a public subprocessor list.
  - Data-subject requests answered within 1 month.
  - Breach notice to the authority within 72 hours.
  - International transfers via SCCs or the EU-US Data Privacy Framework.
  - Fines up to €20M or 4% of global turnover.
- **UK:** most of the Data (Use and Access) Act 2025 changes commenced on **2026-02-05**. They add "recognised legitimate interests", relax automated-decision rules (with safeguards) and change data-subject request handling [S: A&O Shearman, Kennedys 2026].
- **CCPA/CPRA:** applies above **$26.625M** revenue (CPI-adjusted), or 100k+ California consumers/households, or ≥50% of revenue from selling or sharing personal data. New CPPA rules on automated decision-making, risk assessments and cybersecurity audits were finalized in 2025. First audit certifications are due 2028–2030 depending on revenue [S: Morgan Lewis, Fieldguide]. Most early indie SaaS falls below the threshold, but enterprise customers will push CCPA terms into their contracts anyway.
- **B2B DPA:** if you process customer personal data you are a *processor*. You need:
  - A DPA (GDPR Art. 28 terms).
  - A subprocessor list that includes your LLM provider.
  - A security exhibit.
  - SCCs for transfers.

  A template from a generator or law firm costs $0–$2k. Customers will send their own DPA from roughly $5k+ ACV upward [A].
- **LLM-specific terms:** state whether customer data trains models (it usually should not), name the model provider as a subprocessor, and set a retention and zero-data-retention posture.

### 2.4 EU AI Act timeline (as amended by the AI Omnibus, Regulation (EU) 2026/1744, in force 2026-07-27)

| Date | Obligation | Relevance to AI SaaS |
|---|---|---|
| 2024-08-01 | Act enters into force | — |
| 2025-02-02 | Prohibited practices (Art. 5) and AI literacy (Art. 4) apply. The Omnibus softened Art. 4 to a duty to "take measures" rather than guarantee a level [S]. | Do not build banned uses: social scoring, manipulative techniques, workplace emotion recognition and similar |
| 2025-08-02 | General-purpose AI (GPAI) model obligations and penalties regime | Mainly model providers. A SaaS wrapping an API is a *deployer/provider of an AI system*, not a GPAI provider, unless it fine-tunes substantially |
| **2026-08-02** | **Article 50 transparency applies:** tell users they are talking to AI; mark synthetic content; disclose deepfakes | Chatbots and AI-generated content features. Machine-readable marking (Art. 50(2)) for systems already on the market has a grace period to 2026-12-02 (sources differ; DLA Piper's table says 2027-12-02) |
| 2026-12-02 | New Art. 5 prohibitions (non-consensual intimate imagery, CSAM generation) | Image-generation features |
| **2027-12-02** | High-risk obligations for Annex III systems (moved from 2026-08-02): employment/HR screening, credit scoring, education, essential services and similar | AI that ranks job applicants or scores creditworthiness becomes high-risk: conformity assessment, risk management, logging, human oversight |
| 2028-08-02 | High-risk obligations for Annex I systems (AI in regulated products) | Rare for SaaS |

Penalties go up to €35M or 7% of turnover for prohibited practices, with lower tiers for other breaches. Sources: White & Case, DLA Piper, Hogan Lovells (2026) [S]. Verify against the Official Journal text.

### 2.5 SOC 2

| Item | Range (2026) | Source |
|---|---|---|
| Compliance platform (Vanta, Drata, Secureframe) | ~$5k–$20k/yr. Entry prices dropped to ~$7.5k–10k in 2026, and competing quotes pull prices down 20–30%. | [S, vendor comparisons, 2026] |
| Auditor, Type I | $5k–$15k | [S] |
| Auditor, Type II | $12k–$40k | [S] |
| Penetration test | $8k–$30k | [S] |
| All-in, first year | **$20k–$60k** excluding internal time. Internal time is estimated at $25k–$90k. | [S: TraceLayer 2026] |
| Timeline | Type I: **3–6 months**. Type II: an observation window of 3–12 months (3 is the minimum; 6 is the most common first window) plus 2–5 weeks of fieldwork and 2–6 weeks for the report, so **~6–15 months** to the first Type II. | [S: Vanta, Scrut, Drata] |

When to do it: when enterprise or mid-market deals stall on security review. That usually happens around $15k+ ACV or with a buyer in a regulated industry [A]. Before that, a security page plus a completed SIG Lite/CAIQ questionnaire and a trust center is usually enough.

### 2.6 Trademarks (USPTO, from 2025-01-18)

- The base application is **$350 per class**; TEAS Plus and TEAS Standard were merged.
- Surcharges:
  - **+$200 per class** for free-form goods/services text not taken from the ID Manual.
  - **+$100 per class** for an insufficient application.
  - **+$200 per extra 1,000 characters** of description.
- Madrid §66(a) applications are $600/class [S: Fish & Richardson, Gerben, JD Supra].
- Typical SaaS cost: 1–2 classes (009 software, 042 SaaS) = **$700–$1,100** in fees, plus $500–$2k attorney fee if used [A]. Expect about 12+ months to registration.
- Do a knockout search *before* buying the domain or naming the company.

### 2.7 Contracts, e-signature and open source

- **Contracts:**
  - Self-serve uses clickwrap ToS.
  - Sales-led uses an **MSA + Order Form** (+ DPA + SLA/Security exhibit). The order form holds price, term, seats and renewal; the MSA holds the legal terms.
  - Use standard templates (for example Common Paper / Bonterms cloud-service terms) to shorten redlines [A].
  - E-signature is legally valid under ESIGN/UETA in the US and eIDAS in the EU. DocuSign, Dropbox Sign, PandaDoc and similar are fine.
- **SAFEs:** the standard YC post-money SAFE costs $0 in legal fees if used unmodified. Pilot (2024) found an average legal cost of ~$10k for a pre-seed round and ~$17k for a seed round [S].
- **Open source:**
  - Permissive licenses (MIT, Apache-2.0, BSD) are safe to use.
  - With copyleft (GPL), distributing the code triggers source-sharing obligations.
  - AGPL also triggers on network use. Avoid AGPL dependencies in a closed SaaS unless you comply.
  - "Source-available" licenses (BSL, SSPL, Elastic) restrict offering the software as a competing service.
  - Run a license scanner in CI.
- **Typical legal spend, seed company, year one:** **$5k–$20k** using standard documents, more with a priced round or a big firm [S: Promise Legal, forum anecdotes, Pilot]. An indie LLC can be **$500–$3k** [A].

---

## 3. Product development in 2026

### 3.1 AI coding agents: real velocity

- **METR RCT (early 2025):** 16 experienced open-source developers on their own large repos were **19% slower** with AI (CI +2% to +39%). They *believed* they were ~20% faster [P: METR 2025-07-10].
- **METR update (2026-02-24):** late-2025 data shows a speedup of 18% for returning developers (CI −38% to +9%) and 4% for new recruits (CI −15% to +9%). METR calls these a **lower bound** and "very weak evidence" because developers increasingly refused to work without AI and withheld AI-friendly tasks. It considers it likely that developers are more sped up now than in early 2025 [P: METR].
- **YC W25:** ~25% of the batch had ~95% AI-written code, and the batch grew ~10%/week in aggregate [P: TechCrunch/CNBC 2025].
- **Takeaways for the game:**
  - Speedups are largest for greenfield code, prototypes, boilerplate, tests, migrations and unfamiliar stacks.
  - They are smallest (sometimes negative) for large mature codebases, subtle bugs and architecture work.
  - Perceived speedups overstate measured ones.
  - Unreviewed AI code builds security and maintenance debt.

### 3.2 Time to MVP and shipping cadence [A]

- **Narrow B2B workflow tool**, solo founder with agents: **2–6 weeks** to a usable MVP for design partners (2016 norm: 3–6 months).
- **Integration-heavy or regulated product** (payments, health, enterprise SSO): 2–4 months. Integrations, compliance and data still take human time.
- **Cadence:** ship small changes daily to weekly behind feature flags. Hold a weekly customer-facing changelog. Keep one "big bet" at a time.
- **The bottleneck has moved** from writing code to deciding *what* to build, distribution, review/QA and support load.

### 3.3 Specs and prioritization

- **Indie-founder PRD (one page):**
  1. Problem: who has it, how often, current workaround, evidence (quotes or data).
  2. Target user / job-to-be-done.
  3. Proposed solution and non-goals.
  4. Acceptance criteria in Given/When/Then form.
  5. Success metric with baseline, target and time window.
  6. Risks.
  7. Rollout plan.

  This one page doubles as the prompt or spec handed to a coding agent.
- **Prioritization:** RICE (Reach × Impact × Confidence ÷ Effort; from Intercom) works if each input is evidence-backed. Alternatives are ICE and an opportunity-solution tree. With agents, *Effort* shrinks, so **Confidence and Reach dominate**. It is cheap to build the wrong thing quickly.

### 3.4 Onboarding and activation

- **Define activation as the "aha" event** tied to retention (for example: first report generated and shared within 7 days). Measure time-to-value. Remove every step before the aha.
- **Trial design benchmarks:**
  - Opt-in (no card) trial: **~18–25%** trial→paid (First Page Sage, 86 companies, 2022–2025; Softletter older).
  - Opt-out (card required): **~49–60%**, with fewer signups.
  - ChartMogul/ProductLed analysis of 200 B2B products (Jan 2026): **median free→paid ~8%**, card-required ~30%, a 10× spread between the top and bottom quintiles [S].
- **Human touch:** one vendor study reports that a single sales touch during a trial lifts conversion **~38%** (relative; low confidence) [S, 2026]. I found no rigorous public study of concierge (done-with-you) onboarding. Game value: concierge converts **1.5–3× opt-in trial**, capped by founder hours (~1–2 hrs per account) [A].
- **Motion by ACV** (rule of thumb [S]): self-serve below ~$5k ACV; hybrid at $5k–$25k; sales-led above $25k.

### 3.5 AI feature economics

- **List prices** (Anthropic API, checked 2026-10-06), per 1M input / output tokens:

  | Model | Input | Output |
  |---|---|---|
  | Haiku 5.5 | $0.10 | $0.50 |
  | Sonnet 5.5 | $2 | $10 |
  | Opus 5.5 | $4 | $20 |

  Cache reads cost ~0.1× input [P]. Other providers are in a similar band.
- **Worked per-user monthly costs** [A, computed from list prices]:
  - **Light** (30 calls × 2k in / 300 out): ~$0.01 (Haiku) to ~$0.21 (Sonnet).
  - **Moderate assistant** (200 calls × 8k in / 800 out, Sonnet): ~$5, or ~$2–3 with prompt caching.
  - **Heavy agentic** (1,000 agent steps × 40k in / 1.5k out, Sonnet): ~$95 uncached, ~$25–30 with caching. Opus costs ~2× that.
- **Gross margin:** traditional SaaS runs 75–85%. ICONIQ data (via secondary write-ups) puts AI-native products at ~41% (2024) → 45% (2025) → ~52–53% (2026 projected). Adding AI features to SaaS costs ~12–17 margin points [S].
- **Flat-rate heavy-usage plans can go negative:**
  - Replit's gross margin was reported at −14% in April 2025, recovering to 23% by July.
  - Cursor was estimated at about −30% in mid-2025.
  - Anthropic and Cursor both added usage limits [S: The Information via Sacra; investor estimates].
- **Mitigations:** usage caps or credits, model routing (small model by default), caching, batching, and outcome or usage-based pricing.
- **Thin-wrapper commoditization:** model vendors keep absorbing wrapper features (templates, document chat, agents). Widely cited percentages such as "80% of wrappers will fail" are **unsourced**. The durable moats are proprietary data, deep workflow and integrations, distribution, and switching costs [S, qualitative].
  - **Game test:** "Would users still pay if ChatGPT, Claude and Gemini shipped this as a free feature tomorrow?"

---

## 4. Obsolete advice (2016 → 2026)

| 2016 advice | 2026 reality |
|---|---|
| "Hire a technical cofounder or first engineers before you can build." | A solo founder with coding agents can ship an MVP. Hire for judgment and ownership, not keystrokes (YC W25, METR). |
| "Your first hires are support and an SDR." | AI support at ~$1 per resolution handles tier-1. AI SDRs are expensive and churny, so the founder does sales first. Hire humans where trust and judgment matter. |
| "Raise money to hire a team of 10–20 to reach PMF." | Median seed team is ~4 (Carta). Revenue per employee expectations are much higher. |
| "Use contractors freely, the 1099 threshold is $600." | It is $2,000 for 2026 payments. Misclassification risk persists under state tests. Use EOR/CoR for international hires. |
| "Mail your 83(b) by certified mail, keep the receipt." | File online with Form 15620 (since July 2025). The 30-day deadline is unchanged. |
| "Noncompetes protect you; the FTC will ban them." | The ban was vacated and abandoned (2025). Rely on CIIAA and confidentiality. |
| "Trademark via TEAS Plus at $250/class." | $350/class base plus surcharges since 2025-01-18. |
| "Software dev costs are a deduction" (2016), then "must amortize over 5 years" (2022–2024). | Domestic R&D is fully expensible again (OBBBA §174A, 2025+). Foreign R&D is still 15-year amortization. |
| "SOC 2 takes a year and $100k+; only for later." | Platforms bring a first Type I to 3–6 months and $20k–$60k all-in. Still only do it when deals require it. |
| "Privacy policy is boilerplate; GDPR is EU-only." | GDPR, UK DUAA, CCPA and the EU AI Act (Art. 50 transparency from 2026-08-02) apply. B2B buyers require DPAs and AI/subprocessor disclosures. |
| "SaaS gross margin is 80%; marginal user cost ~0." | AI features cost real money per user. Plan for 50–70% gross margin unless you price for usage. |
| "Spend 3–6 months building the MVP." | 2–6 weeks for a narrow tool. The constraint is distribution and choosing the right problem. |
| "A big feature backlog is an asset; estimate engineering effort carefully." | Effort is cheap and confidence is scarce. Prioritize by evidence. |
| "Developers are 10× faster with AI" (2023–2024 hype). | Measured gains are modest and context-dependent, and perception exceeds measurement (METR). |
| "Free trial without a card maximizes conversion." | No-card trials bring more signups at lower conversion (~18–25% vs ~49–60% with a card). Choose by ACV and activation speed. |

---

## 5. Simulation parameters

| Parameter | Game value / range | Indie vs VC | Source + date |
|---|---|---|---|
| Founding/senior engineer salary, US | $140k–$200k base (default $170k) | Indie rarely hires full-time; VC default | Recruiter data [S] 2026; Carta avg $189k [P] Jun 2025 |
| Senior engineer, international | LATAM $55k–110k; Eastern Europe $45k–120k; India $35k–47k; contract $33–75/hr | Indie prefers these | Lemon.io, Wisemonk, placement data [S] 2026 |
| Product designer, US | $105k–$145k | VC; indie uses a contractor ($60–120/hr [A]) | BLS 2025 [P]; Levels.fyi 2026 [S] |
| AE, US | OTE $190k (53:47); quota $800k | VC at ≥$10k ACV | Bridge Group 2024 [P] |
| SDR, US | OTE $80k (68:32) | VC | Bridge Group Feb 2025 [P] |
| Support specialist | US $45k–65k; offshore $12k–30k [A] | Both | Founderpath 2026 [S]; BLS 2025 [P] |
| Employer burden (US) | 1.20–1.30× base (lean); 1.30–1.45× (full benefits) | Indie 1.20–1.25; VC 1.30–1.40 | BLS ECEC Jun 2026: benefits 30–31.5% of total comp [P] |
| International EOR load | +13–40% statutory + $499–699/mo fee | Both | Deel/Remote/Oyster pricing [S] 2026 |
| Gusto payroll | $49/mo + $6/person (Simple); $35 + $6 contractor-only | Both | Sonary, Costbench [S] Mar–Sep 2026 |
| Deel contractor fee | $49/contractor/mo (Remote $29); CoR ~$325 | Both | [S] 2026 |
| AI support agent | $0.99/resolution, 50/mo minimum; resolves 40–65% of tier-1 [A from vendor-claimed 67%]; 1–3 h/wk oversight | Both | Intercom pricing (via [S]) 2026 |
| AI SDR | $3k–5k/mo (11x), $1.5k–5k (Artisan); meeting quality 0.3–0.6× a good human SDR [A]; churn risk high | VC more likely | [S] 2025–26; TechCrunch Mar 2025 |
| AI coding agent subscription | $20–$200/mo per seat; API heavy use $200–$2,000/mo [A] | Both | Vendor plans [S] 2026 |
| Time-to-hire | Engineer 6–10 wks; business role 4–8 wks (founder part-time) [A]; ATS median 30–40 days | VC has a recruiter: −30% [A] | Ashby via [S] 2026 |
| Ramp to productivity | AE 5–6.2 months; engineer 1.5–6 months; AI agent 1–2 wks setup | Both | Bridge Group 2026 [P]; Lethain/Flow [S] |
| First-engineer equity | 0.5–2% (default 1.0%); hire #5 ~0.3%; 4-yr vest, 1-yr cliff | Indie: profit share or none [A] | Carta/Pave via [S] 2026 |
| Option pool | 10–15% post-seed | VC only | Carta-cited [S] 2026 |
| 409A cost | $1k–5k/yr | VC (any options) | Pulley [S] 2025 |
| Severance | 2–8 weeks pay + COBRA | VC higher end | [A]; layoffs.fyi [S] |
| Founder burnout risk | ~50%/yr baseline at >60 h/wk [A] | Both | Sifted Feb 2025 [S] |
| Incorporation | Atlas $500; Clerky $427–819; Firstbase $399; Doola $297/yr+ | VC: DE C-corp; indie: LLC | [S] 2026 |
| Delaware annual | C-corp $175–$400 min franchise tax + annual report fee; LLC $400 (TY2026) | — | HB 400 [S] 2026 |
| 83(b) | $0, 30-day deadline, online Form 15620; missing it = large tax on vesting | Both (if vesting stock) | Law firm alerts [S] Jul–Aug 2025 |
| ToS + privacy | $0–25/mo generator; $1.5k–5k lawyer review | Indie: generator; VC: lawyer | [S] 2026; [A] |
| DPA | $0–2k template; required by B2B buyers ≥ ~$5k ACV [A] | Both B2B | GDPR Art. 28 |
| Trademark | $350/class + $0–200 surcharges; 1–2 classes; ~12 months | Both | USPTO fee rule 2025-01-18 [S] |
| Seed legal spend, year 1 | $5k–20k (indie LLC $0.5k–3k) | VC higher | [S] 2024–2026 |
| SOC 2 | Type I $15k–35k all-in, 3–6 months; Type II first year $20k–60k, 6–15 months; platform $5k–20k/yr | VC or upmarket B2B | [S] 2026 |
| EU AI Act dates | Prohibitions 2025-02-02; GPAI 2025-08-02; Art. 50 transparency 2026-08-02; Annex III high-risk 2027-12-02; Annex I 2028-08-02 | Both (EU users) | Reg. 2026/1744 via White & Case, DLA Piper [S] 2026 |
| AI dev velocity multiplier | Greenfield/prototype 1.5–3× (max 5× for boilerplate); mature codebase 0.8–1.3×; bug-rate +10–30% if unreviewed [A] | Same | METR 2025/2026 [P]; YC W25 [P] |
| MVP time (solo + agents) | Narrow tool 2–6 wks; integration/regulated 8–16 wks | Same | [A] |
| Onboarding conversion | Opt-in trial 15–25% (median free→paid 8%); opt-out card 30–60%; +1 sales touch ×1.38 [low confidence]; concierge 1.5–3× opt-in, 1–2 founder-hours per account [A] | Indie: self-serve; VC: hybrid | First Page Sage, ChartMogul/ProductLed [S] 2025–26 |
| Inference cost per active user/mo | Light $0.01–0.25; moderate $1–5; heavy agentic $20–100+ | Same | Computed from Anthropic list prices (2026-10-06) [A] |
| AI-product gross margin | 45–60% (vs 75–85% plain SaaS); flat-rate heavy usage can go negative | Same | ICONIQ via [S] 2026 |
| Wrapper commoditization | 10–30%/yr chance a platform ships your core feature if moat = prompt only; ~2–5% with proprietary data/workflow [A] | Same | Qualitative [S] 2026 |

---

## 6. Feature spec quality rubric

The rubric serves two purposes: (a) an LLM grading prompt and (b) heuristics that block vague specs before they cost game time. Score each dimension 0–2 (total out of 14).

| # | Dimension | 0 (generic) | 2 (specific) |
|---|---|---|---|
| 1 | **User / segment** | "users", "everyone", "businesses" | A named role and context: "solo bookkeeper managing 10–30 small-business clients in QuickBooks" |
| 2 | **Problem + evidence** | "users want better UX" | Observable pain with frequency, current workaround and evidence: "6 of 9 interviewed bookkeepers spend 2–3 h at month-end chasing receipts by email" |
| 3 | **Behavior change / solution** | "killer feature", "AI-powered", "make it better" | A concrete capability: "client gets an SMS link to snap a receipt; it attaches to the matching bank transaction" |
| 4 | **Acceptance criteria** | none, or "works well" | Testable Given/When/Then statements, including edge cases and failure states |
| 5 | **Success metric** | "increase engagement", "increase session length by 50%" (vanity, no baseline, no causal story) | An outcome metric tied to value, with baseline, target and window: "receipts matched before close: 40% → 75% within 30 days for accounts that enable the feature" |
| 6 | **Scope / non-goals** | absent | "Not in v1: OCR line items, Xero support" |
| 7 | **Cost / risk** | absent | Effort estimate, inference cost per use, privacy/compliance note, rollback plan |

**Verdict:** ≥10 = specific (proceed); 6–9 = needs revision; ≤5 = generic (block).

**Heuristic blocklist.** Block or flag a spec when any of these hold:
1. It uses buzzwords *without* a concrete noun or verb: killer, game-changing, revolutionary, seamless, best-in-class, world-class, delightful, intuitive, next-gen, "AI-powered" alone, "10x", "viral", "Uber for".
2. Its metric is a vanity or engagement metric with no link to value: session length, time in app, page views, "engagement", DAU, "users love it".
3. Its metric has a % target but no baseline or time window ("by 50%").
4. Its user is generic (users, customers, everyone, people) with no role, size or context.
5. It has no acceptance criteria and no "Given/When/Then", "should/must" or verifiable statement.
6. Its problem statement describes the solution ("users need a dashboard").
7. It is under ~40 words, or has no numbers anywhere.

Also apply the **swap test**: if you could swap in a competitor's product name and the spec still reads the same, it is generic.

**Good vs bad examples**

- **Bad:** "Add a killer AI feature to increase session length by 50%."
  - Fails 1, 2, 3, 4, 5, 6 and 7. The metric also rewards friction: longer sessions can mean users are stuck.
- **Bad:** "Build a dashboard so users can see their analytics."
  - Fails 2 (the solution posing as a problem), 1, 4 and 5.
- **Good:** "For agency owners with 5–20 clients who currently screenshot GA4 into slides monthly (7/10 interviewees, ~3 h/month), generate a white-labeled PDF report per client on the 1st of each month.
  - AC: Given a connected GA4 property, when the month closes, a PDF with sessions, conversions and top 5 pages vs the previous month is emailed to the agency for approval; if GA4 auth has expired, the owner gets an email to reconnect and no report is sent.
  - Metric: % of active agencies sending ≥1 client report/month, from 0% to 40% within 60 days; reduce churn in that cohort.
  - Non-goals: custom templates and non-GA4 sources.
  - Cost: ~$0.02 inference per report."

**LLM grading prompt (drop-in):**

```
You are grading a SaaS feature spec written by a founder. Score each dimension 0, 1, or 2:
1 user/segment specificity, 2 problem + evidence, 3 concrete solution behavior,
4 testable acceptance criteria, 5 outcome metric with baseline+target+window tied to customer value,
6 scope/non-goals, 7 cost/risk awareness.
Rules: buzzwords without concrete behavior score 0 on dim 3. Vanity metrics (session length, time in app,
page views, "engagement") score at most 1 on dim 5 unless the spec explains why they cause revenue or retention.
A % target without a baseline scores 0 on dim 5. A problem phrased as a solution scores 0 on dim 2.
Return JSON: {"scores": {...}, "total": n, "verdict": "specific|revise|generic",
"blocking_issues": [...], "rewrite_hint": "one sentence"}.
```

---

## 7. Sources (accessed 2026-10-14 unless noted)

**HR / payroll**
- Deel pricing (2026): https://gloroots.com/blog/deel-pricing, https://www.casrai.org/software/deel-pricing
- Gusto pricing (2026): https://sonary.com/reviews/gusto/, https://costbench.com/software/hr/gusto
- Remote/Oyster/Rippling EOR (2026): https://www.gloroots.com/blog/remote-pricing, https://costbench.com/compare/oyster-hr-vs-remote-com/
- BLS ECEC June 2026: https://www.bls.gov/news.release/ecec.nr0.htm
- Carta startup compensation H1/H2 2025: https://carta.com/data/startup-compensation-h1-2025/, https://carta.com/data/startup-compensation-h2-2025-full-report/
- Founding engineer pay/equity (2026, recruiter blogs): https://www.recruitingfromscratch.com/blog/founding-engineer-compensation-salary-and-equity-in-2026, https://rohitraj.tech/notes/founding-engineer-equity-percentage-2026
- International rates (2026): https://lemon.io/salary-report/, https://www.wisemonk.io/blogs/india-vs-eastern-europe-offshore, https://blog.lapieza.io/the-2026-latam-developer-salary-guide-what-us-canadian-companies-pay-to-hire-in-latin-america/
- Bridge Group AE 2024 / AE 2026 / SDR 2025: https://blog.bridgegroupinc.com/2024-ae-metrics-compensation-benchmark, https://www.bridgegroupinc.com/research/2026-ae-models-motions-metrics
- Designer/support pay: https://www.levels.fyi/t/product-designer/startup/series_b, https://founderpath.com/salary-benchmarks/saas/customer-support-specialist
- Pave data: https://www.pave.com/s/tech-salary-benchmarking
- Ashby time-to-hire (secondary): https://leonstaff.com/blogs/ashby-response-time/
- 409A: https://pulley.com/blog-posts/409a-valuation-cost
- Option pool: https://hub.causo.ai/guides/esop-sizing-seed
- Intercom Fin pricing (2026): https://www.gleap.io/blog/intercom-fin-ai-pricing-2026, https://dragapp.com/blog/intercom-pricing/
- AI SDR pricing/churn (competitor-written, 2026): https://www.artisan.co/blog/11x-pricing-and-reviews, https://www.joinvalley.co/blog/artisan-vs-11x
- DOL contractor proposed rule (Feb–Mar 2026): https://www.klgates.com/thought-leadership/DOL-Publishes-Proposed-Rule-to-Rescind-the-2024-Biden-Era-Independent-Contractor-Test-3-6-2026
- 1099-NEC $2,000: https://www.patriotsoftware.com/blog/accounting/1099-reporting-threshold/
- FTC noncompete (Sep 2025): https://www.paulweiss.com/insights/client-memos/ftc-shifts-approach-to-non-compete-enforcement
- EU Pay Transparency (Sep 2026): https://global.lockton.com/us/en/news-insights/eu-pay-transparency-directive-implementation-status
- Burnout: https://sifted.eu/articles/founders-mental-health-2025, https://www.marsdd.com/media-centre/new-survey-exposes-critical-mental-health-crisis-among-canadian-startup-founders/
- Ramp: https://lethain.com/engineering-onboarding-programs/

**Legal**
- Incorporation services (2026): https://www.rho.co/blog/best-incorporation-services, https://www.flowjam.com/blog/stripe-atlas-vs-clerky-which-is-better-for-your-startup
- Delaware HB 400: https://www.incorp.com/resources/knowledge-base/delaware-business-filing-fee-increase, https://www.discern.com/resources/delaware-franchise-tax-calculator
- 83(b) online (Jul–Aug 2025): https://www.mofo.com/pdf/resources/insights/250724-say-goodbye-to-paper-cuts-section-83-b, https://goodwinlaw.com/en/insights/publications/2025/07/alerts-practices-erisa-online-filing-of-section-83b-elections
- QSBS OBBBA: https://www.kutakrock.com/newspublications/publications/2025/july/changes-to-irc-section-1202-under-obbba
- §174A: https://www.schgroup.com/insights/blog/tax/obbba-restores-full-expensing-for-domestic-research-development/
- USPTO fees (2025-01-18): https://www.fr.com/insights/thought-leadership/blogs/new-uspto-trademark-fees-go-into-effect-january-18-2025/, https://www.jdsupra.com/legalnews/overview-of-key-uspto-trademark-filing-1143372
- EU AI Omnibus (Jul–Aug 2026): https://www.whitecase.com/insight-alert/eu-ai-omnibus-enters-force-amending-ai-act, https://www.dlapiper.com/en/insights/publications/law-in-tech/2026/digital-omnibus-on-ai, https://www.dlapiper.com/en-us/insights/publications/innovation-law-insights/2026/innovation-law-insights-6-august-2026
- CCPA regulations (2025): https://www.morganlewis.com/pubs/2025/08/cppa-board-finalizes-new-rules-on-admt-cybersecurity-audits-and-risk-assessments
- UK DUAA commencement (2026): https://www.aoshearman.com/en/insights/ao-shearman-on-data/key-data-protection-changes-under-the-data-use-and-access-act-2025-comes-into-force
- SOC 2 cost/timeline: https://tracelayer.it.com/blog/soc2-compliance-cost-2026, https://www.vanta.com/resources/how-long-does-a-soc-2-audit-take, https://www.scrut.io/hub/soc-2/soc-2-compliance-timeline
- Termly/iubenda (2026): https://consently.net/blog/iubenda-vs-termly
- Legal spend: https://blog.promise.legal/startup-legal-costs/, https://pilot.com/insights/how-much-does-it-cost-to-raise-a-round

**Product**
- METR 2025: https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/
- METR 2026: https://metr.org/blog/2026-02-24-uplift-update/
- YC W25 AI code: https://techcrunch.com/2025/03/06/a-quarter-of-startups-in-ycs-current-cohort-have-codebases-that-are-almost-entirely-ai-generated
- Coding tool pricing (2026): https://www.verdent.ai/guides/claude-code-pricing-2026, https://pricepertoken.com/coding-assistants/compare/claude-code-vs-cursor
- Trial conversion: https://userpilot.com/blog/?p=1723 (First Page Sage, Softletter), https://visionary-marketing.co.uk/blog/saas-free-trial-conversion-statistics-2026, https://prospeo.io/s/saas-sales-conversion-rates
- AI margins: https://www.saastr.com/iconiqs-latest-state-of-ai-report-the-10-most-important-data-points-for-saas-founders, https://www.cloudzero.com/blog/ai-gross-margin, https://sacra.com/research/replit-at-253m-arr-growing-2352-yoy/
- Wrapper risk (qualitative): https://valueaddvc.com/blog/why-most-ai-startups-are-building-features-not-companies
- Anthropic model pricing: Claude API docs/pricing page (cached 2026-10-06)
