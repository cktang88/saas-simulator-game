---
name: founder-exit-and-capital
description: Advise a real SaaS founder on capital that does not cost equity (revenue-based financing, Stripe Capital-style advances, grants such as SBIR/STTR, credits, customer prepayments) and on selling a small or micro-SaaS business (valuation from ARR/SDE multiples, preparing books and metrics, choosing Acquire.com vs broker vs strategic buyer, LOI terms, diligence, earnouts). Use when the user asks about RBF, non-dilutive funding, "can I fund this without VC", loans against ARR, "what is my SaaS worth", "should I sell", Acquire.com/Flippa, LOIs, earnouts, or exit preparation.
---

# Non-dilutive capital and selling a SaaS (2026)

You are advising a real founder. Compute costs and valuations from the founder's own numbers, show the formulas and label assumptions. Use ranges, because published data mixes asking prices, closed prices and vendor marketing. Do not invent provider terms. Tell the user to get current terms in writing from each provider. This is not legal, tax or investment advice. Full sources are in `docs/research/fundraising.md`.

## Part A: Non-dilutive capital

### Step A1: Gather inputs
Ask for: MRR and its 6–12-month trend, gross margin, monthly logo and revenue churn, billing mix (monthly vs annual), payment processor, profitability, the cash needed and what it is for, and how fast that use will return cash.

### Step A2: Match the need to the instrument
| Need | Best fit | Rough 2026 terms |
|---|---|---|
| Fund a repeatable channel with known payback | Revenue-based financing | ≥$200K ARR or $15K MRR (Lighter Capital floor). Advance of 33–50% of ARR. Repay 2–8% (up to 15%) of monthly revenue until 1.35–2.0x is repaid |
| Bridge annual-contract cash timing | ARR advance / contract financing (Capchase, Founderpath) | Discount-style pricing of ~7–13% (Founderpath's published band) |
| Short working capital, Stripe merchant | Stripe Capital | Flat fee reported at ~8–20%. Repaid as a % of daily Stripe sales |
| R&D with government relevance | SBIR/STTR (US) | Reauthorized Apr 2026 through FY2031 after a ~6-month lapse. Slow. Award sizes vary by agency |
| Infra costs | Cloud/AI credits (accelerators, provider startup programs) | Free, but they expire, so do not let credits hide true gross margin |
| Working capital from customers | Annual prepay discount (10–20% off) | Cheapest money there is; check the churn impact |

### Step A3: Compute the true cost
For any RBF or advance, compute:
- **Total cost** = cap multiple × principal − principal (or the flat fee).
- **Repayment months** ≈ (cap × principal) ÷ (repayment % × monthly revenue, adjusted for growth).
- **Effective APR**: build the monthly cash-flow schedule and solve the IRR. A 1.4x cap repaid over 12 months costs far more than 40% APR. Say so plainly.
- **Payback test:** borrow only when the funded activity's CAC payback is shorter than the repayment period and the gross-margin-adjusted return exceeds the cost. Never use RBF to cover operating losses with no path to profit.
- **Downside test:** rerun the schedule with 0% growth and with churn doubled. If the payment would push the company below 3 months of runway, recommend a smaller amount or no deal.
- Compare against equity: show what the same dollars would cost as a post-money SAFE at the founder's realistic cap (dilution % × a plausible exit value).

### Step A4: Watch the fine print
Flag personal guarantees, blanket liens on IP, minimum monthly payments, covenants (minimum cash, MRR), prepayment penalties, warrants, and cross-default clauses. Ask whether the facility blocks a later VC round or a sale (change-of-control payoff).

## Part B: Valuing and selling a micro-SaaS

### Step B1: Normalize the numbers
Collect 24–36 months of monthly P&L, MRR, churn, cohorts, top-10 customer concentration, owner hours per week, tools and vendors, and the number of contractors.
- Compute **SDE** (seller's discretionary earnings) = net profit + owner salary + one-off and personal add-backs. Justify every add-back.
- Compute TTM revenue, TTM profit, ARR, YoY growth, gross and net revenue retention, gross margin after inference and hosting, and the largest customer's share.
- Reconcile MRR to bank deposits. Deals collapse over unexplained gaps.

### Step B2: Value it as a range, never a point
| Business | Typical basis | 2025–2026 range |
|---|---|---|
| <$1M ARR, owner-dependent | Multiple of SDE/profit | ~4–6x SDE; asking averages ~10.7x TTM profit on Acquire.com listings (asks run above closes) |
| <$1M ARR, by revenue | Multiple of TTM revenue | ~2–4x (Acquire.com closed-deal reports: 2–3x revenue / ~5x profit in 2022; 2026 listing asks avg ~2.6x) |
| $1–5M ARR, healthy | Multiple of ARR | ~4–6x |
| $5–20M ARR, strong growth/NRR | Multiple of ARR | ~5–8x |
| Indie exits overall | Multiple of ARR | 60% close at 1–3x ARR (MicroConf 2024) |

Move the multiple **up** for NRR >110%, GRR >90%, gross margin 70–85%, growth >25% YoY, owner time under 10 h/week, diversified customers and clean accrual books. Move it **down** for flat or declining MRR, a customer above 30% of revenue, platform dependency (one API or marketplace), high churn, messy books, or AI-wrapper exposure to model-provider changes. Quality can move the price 2x within a band. A strategic buyer (e.g. Wix paying ~$80M upfront for 6-month-old Base44 in 2025) pays for strategic value. Treat that as an outlier, not a benchmark.

### Step B2b: Decide whether to sell or keep
- Compare the after-tax sale proceeds against 3–5 years of owner cash flow (SDE minus a market salary for the founder's time), discounted at a high rate (20–30%) for small-business risk.
- Selling makes sense when growth has stalled, platform or model-provider risk is rising, the founder's next idea needs full attention, or the offer exceeds ~4–5 years of SDE.
- Keeping makes sense when MRR is growing over 25% YoY. Each year of growth then adds more value than waiting costs.
- For a VC-backed company, check the liquidation preference stack first. A sale below the preference total can leave common shareholders, including the founder, with little or nothing.

### Step B3: Prepare 3–6 months before listing
1. Switch to accrual books with clean categories and remove personal expenses.
2. Document operations: SOPs, an infrastructure map, credentials handover, and vendor contracts.
3. Reduce owner dependence: automate support with agents and document the processes.
4. Fix leaks that cut the multiple: failed-payment recovery, annual plans, top-customer concentration.
5. Build the data room: P&L, bank statements and tax returns for 2–3 years; an MRR waterfall reconciled to deposits; cohorts; a concentration report; contracts; add-back schedule; tech stack and IP assignment.

### Step B4: Choose the channel
- **Marketplace (Acquire.com, Flippa):** best for deals under ~$2–5M. Expect operator buyers and small search funds. The process is fast and structured.
- **Broker or M&A advisor:** best for deals over ~$1M ARR with a team. A competitive process can add a point or more of multiple, so weigh that against the fee (ask for it in writing).
- **Direct strategic approach:** list 10–20 companies whose customers overlap with yours, and approach them through partnerships months ahead.

### Step B5: LOI and diligence
- Compare LOIs on **certainty and cash at close**, not headline price. Look at cash at close, the earnout (amount, metric and who controls it), seller note, escrow or holdback, exclusivity length (push for 30–45 days), transition period, and non-compete scope.
- Discount earnouts heavily if the buyer controls the levers that drive the metric. Model the price as cash + a probability-weighted earnout.
- In diligence, answer fast and from the data room. Expect a re-trade if any metric is off, so disclose problems up front.
- Plan for taxes and asset vs stock sale structure with an accountant before signing the LOI.

## Output format
1. A capital recommendation (instrument, amount, true cost/APR, payback test result) or "don't borrow" with reasons.
2. A valuation range table (low/base/high) showing the multiples used and the drivers moving them.
3. A prep checklist with owners and dates.
4. An LOI comparison table if offers exist.
