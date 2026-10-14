---
name: founder-saas-analytics
description: Compute and interpret SaaS metrics from a real Stripe export, billing CSV or database dump - MRR and its movements (new, expansion, contraction, churn, reactivation), logo and revenue churn, NRR/GRR, cohort retention tables, ARPA, LTV, CAC, CAC payback, quick ratio, burn multiple, gross margin (including AI inference cost) and runway - and produce a weekly dashboard with problems flagged. Use when the user shares subscription or payment data, asks "what is my MRR/churn/NRR", wants a cohort analysis, asks what metrics to watch weekly, or wants to know why revenue is flat or falling.
---

# SaaS analytics from raw billing data

You are computing a founder's SaaS metrics from their own data and explaining what the numbers mean. Be exact about definitions, show the formulas, reconcile totals, and say which numbers are estimates. Write and run code (Python with pandas, or SQL) rather than doing arithmetic by hand. Benchmarks with sources are in `docs/research/finance-and-payments.md` section 5; for full unit-economics modeling, also see the `saas-unit-economics` skill.

## Step 1: Get the right data

Ask for, in order of preference:
1. Stripe exports: **Subscriptions** (id, customer, status, created, current_period_start/end, canceled_at, ended_at, plan amount, interval, interval_count, quantity, discount), **Invoices** (customer, subscription, amount_paid, period_start/end, status, paid_at) and **Customers**. Or the equivalent from Paddle, Lemon Squeezy, Polar, Chargebee or the app database.
2. A monthly cost breakdown or bank export for gross margin and burn: hosting, LLM API, support, sales and marketing spend.
3. Signups or trials by month, if available, for conversion.
Never paste customer emails or card data back into the answer. Refer to customers by id.

## Step 2: Normalize to MRR

Build one row per customer per month (month-end snapshot):
- MRR = plan amount × quantity ÷ months in the interval (annual ÷ 12, quarterly ÷ 3), after recurring discounts.
- Exclude one-time charges, setup fees, taxes, refunds of past periods and usage overages unless usage is the business model (then use the trailing month's usage).
- Trials count as 0 MRR until the first successful payment.
- Decide and state the past-due rule: keep past-due subscriptions in MRR during dunning (Stripe default retry window), and count churn at the date the subscription ends. Apply it consistently.
- Convert currencies at a fixed rate per month and state it.
Check: total MRR for the latest month should match Stripe Billing's MRR (or the MoR dashboard) within a few percent. If not, find the gap before going on (usual culprits: annual plans, discounts, multiple subscriptions per customer, test-mode data).

## Step 3: Classify MRR movements per customer per month

Compare each customer's MRR this month (m1) to last month (m0):
- m0 = 0, never paid before, m1 > 0 → **New**
- m0 = 0, paid before, m1 > 0 → **Reactivation**
- m0 > 0, m1 > m0 → **Expansion** (m1 − m0)
- 0 < m1 < m0 → **Contraction** (m0 − m1); discounts that lower MRR are contraction
- m0 > 0, m1 = 0 → **Churn** (m0)
Then check the identity: MRR_end = MRR_start + New + Expansion + Reactivation − Contraction − Churn. If it does not hold exactly, there is a bug; fix it.
Split churn into **voluntary** (canceled) and **involuntary** (ended after failed payments: status went past_due/unpaid before ending). Involuntary churn is often a third of the total and is the cheapest to fix.

## Step 4: Compute the core metrics

For each month, and as a trailing 3-month average:
- Logo churn = churned customers ÷ customers at start of month.
- Gross MRR churn = (churn + contraction) ÷ starting MRR.
- Net MRR churn = (churn + contraction − expansion − reactivation) ÷ starting MRR.
- NRR (12-month, cohort-based) = MRR today from customers active 12 months ago ÷ their MRR then. GRR is the same with each customer capped at their starting MRR.
- Quick ratio = (new + expansion + reactivation) ÷ (contraction + churn). Above 4 is strong; below 1 means shrinking.
- ARPA = MRR ÷ paying customers.
- Gross margin = (revenue − COGS) ÷ revenue, with COGS including production hosting, **LLM inference**, payment fees and support. Also compute inference cost as % of revenue and per active customer.
- LTV = ARPA × gross margin ÷ monthly revenue churn (cap at 5 years if churn is tiny).
- CAC = sales and marketing spend (including people) ÷ new customers; by channel if possible. CAC payback = CAC ÷ (ARPA × gross margin), in months.
- Burn multiple = net burn ÷ net new ARR (quarterly is more stable). Under 1 amazing, 1–1.5 great, 1.5–2 good, 2–3 suspect, over 3 bad (Sacks, 2020).
- Runway = cash ÷ trailing 3-month net burn; state whether the company is default alive.
Use small samples carefully: with under about 50 customers, report counts alongside percentages and avoid strong conclusions from one month.

## Step 5: Cohort tables

Build two tables, rows = first-paid month, columns = months since first payment:
1. **Logo retention**: % of the cohort's customers still paying.
2. **Revenue retention**: cohort MRR ÷ cohort starting MRR (can exceed 100%).
Read them for: where the curve flattens (if it never does, there is no retained segment yet), whether recent cohorts beat older ones (the product or onboarding is improving), and a sharp drop at month 1 or at the annual renewal month (onboarding or renewal problem). Render as a heatmap if the user wants a chart.

## Step 6: Weekly dashboard

Produce a one-screen summary the founder can check every Monday:
1. Cash, net burn, runway, default alive or dead.
2. MRR and net new MRR this week and month, split by movement.
3. New trials or signups, activation rate and trial-to-paid conversion.
4. Cancellations with stated reasons; contraction.
5. Failed payments: count, amount, recovered %, still in dunning.
6. AI inference spend vs revenue; top 10 customers by inference cost vs what they pay.
7. Disputes and refunds this week.
8. For B2B: pipeline by stage.
Monthly, add the cohort tables, NRR/GRR, gross margin, CAC payback and burn multiple.

## Step 7: Spot problems

Flag these explicitly, each with the number that triggered it and one concrete next step:
- Quick ratio under 2, or churn plus contraction larger than expansion for 3 months.
- Logo churn above the segment range (B2C over about 8%, SMB over about 3–5%, enterprise over 1% monthly).
- Involuntary churn over about 1% of MRR a month, or recovery under 50%: turn on Smart Retries, card updater, pre-expiry emails.
- New cohorts retaining worse than old ones.
- Gross margin under about 60% for an AI product (or under 75% for non-AI SaaS), or single customers whose inference cost exceeds their price: move to usage or credit pricing, route to cheaper models, cache prompts.
- CAC payback over 12 months (SMB) or rising for 3 months.
- Burn multiple over 2, or runway under 9 months without a funded plan.
- Dispute rate approaching 0.75% (Stripe's excessive level) or refunds rising.
- MRR growth driven only by price increases while customer count falls.

## Output format

- Lead with the 3–5 numbers that matter most and the top problem.
- Then the movement table (month × movement), the metrics table, and the cohort tables.
- State every definition choice (past-due rule, currency rate, what counts as COGS) and every estimate.
- Save any scripts you wrote so the user can rerun them next week on a fresh export.
