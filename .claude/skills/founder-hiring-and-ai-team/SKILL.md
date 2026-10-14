---
name: founder-hiring-and-ai-team
description: Decide what a solo SaaS founder should automate with AI agents, hand to contractors, or hire for, then cost it out (salary, employer burden, payroll/EOR fees, AI agent pricing), choose contracts (CIIAA, contractor vs employee), set up payroll, and size equity grants. Use when the user asks "should I hire", "who should my first hire be", "can AI replace a support/sales/engineering hire", contractor vs employee, hiring abroad, Gusto/Deel/Remote, salaries, equity for early employees, option pool, 409A, firing/severance, or founder burnout and workload.
---

# Founder hiring and AI team design (2026)

You are helping a solo or very small SaaS founder decide **how to get work done**: with AI agents, contractors, or employees. In 2026 the default is to stay small. A founder with coding agents and AI support can reach meaningful revenue alone. Hire humans where judgment, trust, or accountability matters. This is general information, not legal or tax advice: recommend an employment lawyer or accountant for classification, equity and termination decisions.

Reference data: `docs/research/hr-legal-product.md` (sections 1 and 5). Quote ranges, not single numbers. Name the source and date when you cite a figure.

## Step 1: Gather context (one message)

Ask only for what's missing:
1. Path: bootstrapped/indie or VC-backed? Current MRR or runway, and the monthly budget for people and tools.
2. Product, ACV and sales motion (self-serve, hybrid, sales-led).
3. Founder's hours per week and how they are spent today. Ask for a rough split across build / sell / support / ops.
4. The pain: what is not getting done, and what it costs (lost deals, slow response, churn, burnout).
5. Where candidates or customers are (US state, EU, other) and the founder's country and entity type.

## Step 2: Break the work into tasks, not roles

List the recurring tasks with hours per week. Classify each one:

| Task trait | Best owner |
|---|---|
| High volume, documented answers, low stakes per instance (tier-1 support, FAQ, triage, data entry, first-draft content, test writing, boilerplate code) | **AI agent**, with founder review |
| Specialist and bounded (logo, legal review, pentest, bookkeeping close, a specific integration) | **Contractor**, fixed scope |
| Core, ongoing, needs judgment and ownership (architecture, closing deals above ~$10k ACV, key accounts, on-call) | **Founder**, then an **employee** |
| Trust-critical or regulated (security incidents, refunds over a threshold, hiring decisions) | Human only |

Rules of thumb:
- **Automate first** when the task is repetitive and the knowledge is written down. If the docs don't exist yet, writing them is the first task.
- **Contract next** for anything with a clear deliverable.
- **Hire** only when a task is continuous, needs context that compounds, and AI plus contractors already fail at it. Also check that you can pay for 12+ months: indie needs that from revenue, VC from runway at most ~1/3 consumed by the hire.

## Step 3: Cost each option realistically

Use these 2026 ranges and state that the user must check current prices:
- **AI support (Intercom Fin-style):** ~$0.99 per resolution plus a monthly minimum. The vendor claims ~67% resolution; plan for **40–65%** of tier-1, plus 1–3 founder hours/week reviewing transcripts and fixing docs.
- **AI SDR (11x/Artisan-style):** ~$1.5k–$5k/month on annual contracts. Early cohorts saw high churn and weak reply handling. Recommend the founder do outbound personally until there is a proven message, then test an AI SDR on a 1–3 month plan if one can be negotiated.
- **Coding agents:** $20–$200/month per seat, more on API billing. Measured speedups are modest (METR: −19% in early 2025, a small positive lower bound in late 2025). Expect large gains on greenfield and boilerplate work, small gains on a mature codebase. Never budget them as "replaces an engineer".
- **US employee, fully loaded:** base × **1.20–1.30** (lean benefits) or × **1.30–1.45** (full benefits; BLS June 2026: benefits are 30–31.5% of total compensation). Add recruiting time (6–10 weeks), ramp (engineer 1.5–6 months, AE ~5–6 months) and payroll fees.
- **Salaries (US, early stage):** engineer $140k–$200k; designer $105k–$145k; AE OTE ~$190k (53:47 split); SDR OTE ~$80k; support $45k–$65k.
- **International:** senior engineer LATAM $55k–$110k, Eastern Europe $45k–$120k, India $35k–$47k. Contract rates run $33–$75/hr.
- **Payroll/EOR fees:**
  - Gusto ~$49/month + $6/person; contractor-only $35 + $6.
  - Deel contractor $49/month; Remote contractor $29/month.
  - EOR ~$499–$699/employee/month, plus 13–40% statutory employer costs abroad.

Present a table: option | monthly cash | founder hours/week saved | quality risk | time to productive | reversibility. Recommend one option and give the reason.

## Step 4: Classify and contract correctly

- **Contractor vs employee (US):** under the DOL's 2026 proposed rule, control and opportunity for profit or loss are the core factors. The IRS common-law test still applies, and state tests (for example California's ABC test) are stricter. Flag misclassification risk when the founder sets hours, the person works only for them, does core ongoing work, or is managed like staff. Suggest converting the role to an employee, or using EOR / Contractor of Record for people abroad.
- **Every person signs a CIIAA** (confidentiality + invention assignment, "hereby assigns") **before** starting work. Contractors sign an agreement with a present-tense IP assignment, a defined scope and payment terms.
- The 1099-NEC threshold is **$2,000** for payments made in 2026. Collect a W-9 (US) or W-8BEN (non-US) up front anyway.
- Noncompetes: the FTC ban was vacated (2025), so state law applies, and California voids most noncompetes. Rely on confidentiality and IP terms instead.
- Hiring in the EU: include a pay range before interviews where the Pay Transparency Directive has been transposed, and never ask about salary history.

## Step 5: Payroll and compliance setup checklist

1. EIN, then state withholding and unemployment accounts in each state where employees work (the payroll provider can register these).
2. Payroll provider (Gusto/Rippling for the US; Deel/Remote/Oyster for EOR abroad). Contractor payments go through the same tool so 1099s are generated automatically.
3. Workers' comp insurance (required in most states). Health insurance or an ICHRA/QSEHRA if offered.
4. Offer letter: at-will statement (US), salary, equity summary, CIIAA attached, start date.
5. I-9 within 3 business days of the start date; E-Verify where required.
6. For AI agents: a written escalation policy, a data-access scope, and a review cadence. Disclose the AI to customers (EU AI Act Art. 50 transparency has applied since 2026-08-02).

## Step 6: Equity (VC path; optional for indie)

- Set up an option pool of **10–15%** at seed. A **409A valuation ($1k–$5k)** is needed before granting options. Grants: 4-year vesting, 1-year cliff.
- First engineer: **~0.5–2%** (typical ~1%); hire #5 ~0.3%. Senior hires trade cash for equity. Show the candidate the dilution math honestly: a 1% grant at seed is not 1% at exit.
- Indie alternative: a profit-sharing bonus or a phantom/revenue-share plan. Recommend a lawyer for the plan document.
- Consider early-exercise eligibility and point out the 83(b) deadline (30 days; file online with Form 15620).

## Step 7: Firing, severance and the founder's own capacity

- Document performance expectations in writing. Run a 30-day improvement plan for underperformance (not for misconduct).
- Severance norm: 2–8 weeks of pay plus COBRA support, in exchange for a signed release (age 40+ has OWBPA review periods). Pay final wages per the state's deadline (some states require payment on the last day).
- Burnout is the founder's most common failure mode: over half of founders surveyed reported burnout in the past year (Sifted 2025). If the founder works more than ~55 hours/week, the first "hire" is usually an AI agent or contractor that removes the most draining recurring task.

## Output format

1. Work audit table: task, hours/week, recommended owner, reason.
2. Cost comparison table: AI vs contractor vs hire, monthly and first-year.
3. Recommendation with triggers: "hire a human X when Y metric hits Z".
4. Contracts and setup checklist for the chosen option.
5. Risks (misclassification, quality, data access, burnout) and a reminder to verify prices and get legal/tax advice.

Avoid 2016 defaults: "your first hire should be support or an SDR", "raise to hire 10 people before PMF", and "contractors are always cheaper and simpler".
