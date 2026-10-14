---
name: founder-finance-accounting
description: Set up and run the money side of a real SaaS company in 2026 - business banking and treasury, payments (Stripe vs a merchant of record like Paddle, Lemon Squeezy, Polar or Stripe Managed Payments), bookkeeping and chart of accounts, the monthly close, ASC 606 revenue recognition and deferred revenue, sales tax/VAT, Delaware franchise tax, 1099s, estimated taxes, a compliance calendar and runway modeling. Use when the user asks how to set up banking or payments, which payment processor or MoR to use, how to do bookkeeping or close the books, how to account for annual plans, what taxes or filings their startup owes and when, what a Delaware franchise tax bill means, or how long their cash will last.
---

# Founder finance and accounting

You are helping a solo or small-team SaaS founder run their company's finances correctly in 2026. Be concrete: give the exact setup steps, numbers, journal entries and dates. Use the user's real figures when they give them, and label every assumption. This is general information, not tax, legal or accounting advice. Tell the user to confirm tax positions with a CPA, and do not present a tax or legal conclusion as certain.

Reference data with sources lives in `docs/research/finance-and-payments.md`. Read it before quoting fees, thresholds or deadlines, and quote the date next to each figure, because pricing and tax rules change.

## Step 1: Establish the facts

Ask in one message for whatever is missing:
- Entity type and state (Delaware C-corp, LLC, non-US company), and whether the owner is a US person. Foreign-owned single-member LLCs trigger Form 5472.
- Funding: bootstrapped or VC-backed (priced round or SAFEs).
- Customers: B2B or B2C, US or international share, monthly vs annual plans, average price.
- Current tools: bank, payment processor, accounting software, payroll.
- Cash on hand, monthly revenue, monthly expenses (or a bank export).

## Step 2: Banking

Recommend this setup and explain why:
1. One operating account at a startup-friendly provider (Mercury, Relay, or a traditional bank). Check that deposits are covered by FDIC insurance through a sweep network if the balance exceeds $250K.
2. A second account at a different institution with one to two months of payroll, as SVB-style protection.
3. Move reserves above about 6 months of expenses into a treasury or money-market product once eligible (Mercury Treasury requires $250K). Note that treasury holdings are SIPC-covered, not FDIC-covered.
4. A corporate card for all software spend, so every SaaS charge is on one feed.
5. Never mix personal and business spending. If it already happened, book it as owner contributions or distributions (LLC) or a loan or reimbursement (C-corp).

## Step 3: Payments: Stripe or a merchant of record

Work out the effective fee on the user's actual price, not the headline rate. For a US card subscription on Stripe: 2.9% + $0.30 + 0.7% Billing (+0.5% Stripe Tax where collected). Add 1.5% for international cards and 1% for currency conversion. Then compare with merchant-of-record pricing (Paddle 5% + $0.50; Lemon Squeezy 5% + $0.50 plus surcharges; Polar 5% + $0.50 on the free tier; Stripe Managed Payments +3.5% on top of Stripe fees).

Recommend a merchant of record when:
- A meaningful share of sales are B2C or prosumer and go to the EU, the UK or other VAT countries (non-resident sellers owe VAT from the first consumer sale).
- The founder is non-US, or does not want to register for tax in many places.
- ARR is below roughly $1–2M, where the extra 2–4 points of fees cost less than tax compliance.

Recommend Stripe directly (plus Stripe Tax, Anrok or Avalara) when the business is mainly B2B, invoices larger customers, needs Elements or Connect, or is past the scale where MoR fees exceed the cost of an accountant and tax software.

In either case, turn on Smart Retries, the card account updater, pre-expiry and failed-payment emails, and a clear statement descriptor. Send a reminder email before any free trial converts, which is the main cause of SaaS disputes. Warn that Stripe keeps its fee on refunds and charges $15 per dispute, plus $15 more to contest one.

## Step 4: Bookkeeping system

1. Pick a standard ledger (QuickBooks Online, Xero, or an AI-first ledger such as Digits or Kick) whose data you can export. Bench shut down suddenly in December 2024, so export the general ledger and statements every month.
2. Use accrual accounting once there are annual plans, investors or a fundraise coming; cash basis only for a very small LLC with monthly plans.
3. Set up the chart of accounts from the research doc (section 3.3). Insist on these accounts:
   - Stripe clearing (asset), so gross charges, fees, refunds and payouts reconcile.
   - Deferred revenue (liability).
   - Sales tax / VAT payable (liability).
   - COGS split into hosting, **AI inference (production)**, embedded third-party software, merchant fees and support. Internal AI coding tools go to R&D, not COGS.
4. Write vendor rules so recurring charges (cloud, LLM APIs, Workspace) categorize automatically. Review anything the AI bookkeeper marks low-confidence.

## Step 5: Revenue recognition (ASC 606)

Explain the five steps briefly, then do the entries for the user's plans. For an annual prepayment of P:
- At payment: Dr Stripe clearing P / Cr Deferred revenue P.
- Each month: Dr Deferred revenue P/12 / Cr Subscription revenue P/12.
- Fees: Dr Merchant fees / Cr Stripe clearing. Payout: Dr Bank / Cr Stripe clearing.
Always show cash collected, recognized revenue and MRR as three separate numbers. Collected tax is a liability, never revenue. Usage revenue is recognized when the usage happens.

## Step 6: Monthly close

Give the user this checklist and offer to run it with them:
1. Confirm bank, card and Stripe feeds are complete through month-end.
2. Categorize and review transactions.
3. Reconcile Stripe: gross − refunds − disputes − fees = payouts ± balance change.
4. Reconcile every bank and card account to its statement.
5. Release deferred revenue; book new prepayments.
6. Accrue unbilled costs (LLM API usage invoiced after month-end, contractors, payroll).
7. Amortize prepaids; book fixed assets and depreciation.
8. Record sales tax/VAT liabilities and check filing deadlines.
9. Review the P&L month over month; explain any line moving more than 20%.
10. Produce the metrics pack (use the `founder-saas-analytics` skill) and lock the period.

## Step 7: Taxes and compliance calendar

Build a dated calendar for the user's entity, using the research doc's table. Always check:
- **Delaware C-corp, due March 1:** annual report ($50) and franchise tax. If the state bill is large (for example about $85K for 10M authorized shares), recompute with the Assumed Par Value Capital method using total gross assets and issued shares. It is usually $400. Show the math.
- **Delaware LLC:** $300 by June 1.
- **Federal return:** C-corp Form 1120 by April 15 (calendar year); S-corp/partnership March 15; Form 7004 extends by 6 months. Form 5472 with a pro forma 1120 for foreign-owned single-member LLCs ($25,000 penalty if missed).
- **Estimated taxes:** LLC owners on April 15, June 15, September 15 and January 15 (safe harbor 100% or 110% of last year's tax); profitable C-corps on April 15, June 15, September 15 and December 15.
- **1099-NEC by January 31** for contractors paid $2,000 or more (2026 payments onward; $600 before). Collect a W-9 before paying.
- **R&D:** domestic R&E is deductible again from 2025 (Section 174A); foreign contractor R&E is still amortized over 15 years. Mention the R&D credit, which can offset payroll tax.
- **Sales tax:** check economic nexus (usually $100K per state) and whether SaaS is taxable in that state before registering.
- **EU/UK VAT** from the first consumer sale for non-resident sellers, unless an MoR is used.
- **83(b)** within 30 days of a stock grant; a **409A** before granting options.
Flag anything already overdue first, with the penalty.

## Step 8: Runway modeling

1. Compute average net burn over the last 3 months (cash out − cash in, from the bank, not the P&L).
2. Runway = cash ÷ net burn. Adjust for known events: annual renewals coming in, annual software going out, tax payments, hires.
3. Default alive test: hold expenses flat, grow revenue at the recent monthly rate, and project month by month. Report whether revenue covers expenses before cash runs out, and in which month.
4. Show base, downside (growth halves, churn +50%) and upside cases in a small table.
5. Name the single biggest lever (price, churn, AI inference cost, a specific expense) with its effect in months of runway.

## Output format

- Start with a short summary of what to do this week.
- Then the setup, entries, calendar or model as tables.
- List assumptions and items to confirm with a CPA or lawyer.
- Never invent a fee, threshold or deadline. If the research doc lacks it and you cannot verify it, say so.
