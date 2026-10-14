# Finance, accounting, banking, payments, taxes and SaaS metrics (research, October 2026)

Research date: 2026-10-14. Scope: what a solo or small-team SaaS founder (bootstrapped or VC-backed, US-incorporated unless noted) actually has to do with money in 2026, and the numbers the simulator should use. This is general information, not tax, legal or accounting advice.

**How to read the confidence notes.** "Official" means the provider's own pricing page or docs, or a government site. "Vendor" means a blog from a company that sells a competing or related product, and it may be biased. "Designer estimate" means no authoritative source was found and the value is a reasonable game assumption; the game should label it as an estimate in any teaching text.

---

## 1. Payments in 2026

### 1.1 Stripe standard pricing (US account, checked 2026-10-14 on stripe.com/pricing, official)

| Item | Price |
|---|---|
| Domestic card | 2.9% + $0.30 per successful charge |
| International card | +1.5% |
| Currency conversion | +1% when conversion is needed |
| Manually entered card | +0.5% |
| ACH Direct Debit | 0.8%, capped at $5.00 |
| Stripe Billing (pay as you go) | 0.7% of Billing volume (annual plans from $620/month exist for large volume) |
| Usage-based billing on Metronome (now a Stripe product) | Startup tier: $0.04 per 1K ingested events + 0.8% of billing volume. Basic meters via the Meters API are included with Billing up to 100M events/month |
| Stripe Tax Basic | 0.5% per transaction where you are registered and tax is collected (no-code); $0.50 per transaction via API. Tax Complete (with filing) from $90/month |
| Invoicing Starter | 0.4% per paid invoice |
| Dispute received | $15.00 per dispute, not refunded even if you win |
| Dispute countered (since June 17, 2025) | +$15.00 if you submit evidence; refunded if you win |
| Smart Disputes (AI evidence) | 30% of the recovered amount on won disputes; waives the counter fee |
| Radar | Radar Lite included on standard pricing; paid tiers from $10/month or $0.05 per screened transaction |
| Card account updater | Included with Payments on standard pricing (part of Authorization Boost) |
| Adaptive Pricing (local currency) | No fee to merchant; customer sees a conversion fee from 2% |
| Revenue Recognition | $25/month (monthly plan) |
| Sigma (SQL on your Stripe data) | $15/month (monthly plan) |
| Stripe Atlas (Delaware incorporation) | $500 one-time, includes state fees and first-year registered agent |
| Standard payouts | Free |
| Instant payouts | 1.5% of volume, $0.50 minimum |
| Refunds | No refund fee for cards, but the original processing and currency-conversion fees are **not returned** |

**Worked example (for the Stripe dashboard clone):** a $49/month subscription paid with a US card through Stripe Billing costs $1.42 + $0.30 + $0.34 = **$2.06 (4.2%)**. Add Stripe Tax and it is about **$2.31 (4.7%)**. The same plan paid with a European card that needs currency conversion costs 2.9% + 1.5% + 1% + 0.7% + $0.30 = **about $3.29 (6.7%)** before tax fees.

### 1.2 Payouts and holds (official, Stripe docs)

- US settlement timing: funds become available **2 business days** after the charge (T+2). The payout schedule (daily, weekly, monthly or manual) is separate from settlement timing.
- First payout: "After you successfully receive your first live payment, Stripe typically schedules your initial payout to complete within **7–14 days**, depending on your industry, country of operation, and risk level."
- Stripe can add reserves or delays for risky accounts (sudden volume spikes, high dispute rates, prepaid annual plans). In the game this is a risk event, not a constant.

### 1.3 Disputes and fraud

- Stripe's docs: "The credit card processing industry standard recognizes dispute activity above **0.75%** as excessive." Won disputes still count toward the ratio.
- Visa's VAMP program: the merchant "Excessive" threshold dropped from 2.2% to **1.5% on April 1, 2026** in the US, Canada, EU and Asia-Pacific. It counts fraud reports (TC40) plus disputes (TC15) over settled transactions and applies once a merchant has at least 1,500 events a month (vendor sources: justt.ai, fraud.net, chargebackhelp.com, 2026).
- Typical rates (vendor data, inconsistent): cross-industry average **0.26%** of transactions in Q3 2025 (Sift data cited by chargeback.io); "software" about 0.66%; SaaS/digital goods **0.54% to 0.8%** (fungies.io, spendbase 2026). For the game, B2B SaaS with good descriptors and receipts should sit at about 0.1–0.3%; B2C with free-trial auto-conversion runs 0.5–0.8%. Treat both as designer estimates bracketed by the vendor data.
- The main real-world causes are free trials that convert without a reminder email, unrecognizable statement descriptors, and stolen cards used for card testing on signup forms.

### 1.4 Failed payments, dunning and involuntary churn

- Stripe's own figure: "Businesses using Stripe **recover 55% of failed payments** on average", and "$8.2B in failed payments recovered in 2025" (stripe.com/billing, official). This is volume-based and counts every recovery method (Smart Retries, emails, card account updater), not retries alone.
- Independent and vendor estimates for Smart Retries on their own: **25–40%** for B2C and mixed accounts (vendor blogs, 2025–2026). A median recovery of 47.6% is also widely cited.
- Recurly's benchmark page (updated with July 2026 data): **involuntary churn 1.25%**, voluntary 2.34%, overall 3.60%. The page is inconsistent about the period (its FAQ calls 1.25% the "median annual involuntary churn rate"; the tiles give no period), so use it only to show that involuntary churn is roughly a third of all churn. At $250+ ARPC, involuntary churn is only 0.18%.
- Chargehive (vendor) puts monthly involuntary MRR churn at 1.5–3.0% for consumer SaaS, 0.8–2.0% for SMB SaaS, and 0.3–0.8% for mid-market and enterprise.
- Raw failure rate before recovery: a 2026 vendor guide cites about 13% of recurring charges declining at least once a month (unverified). Use 5–15% of renewal charges failing on the first attempt in the game, scaling up with B2C and debit or prepaid cards.
- Tools that matter in 2026: Smart Retries (ML-timed retries), card account updater (automatic new card numbers), network tokens, pre-dunning emails before card expiry, and a hosted page for updating the card.

### 1.5 Refunds

No authoritative B2B SaaS refund benchmark exists. Mobile subscription apps have a median refund rate of about 2.7% (Adapty data), with annual plans at 6–7.6%. Vendor blogs suggest under 2% of charges for SaaS. **Game value: 1–3% of charges** (designer estimate). Stripe keeps its fee on refunded charges, so every refund costs the founder about 3–4% of the original amount on top of the refund.

### 1.6 Merchant of record (MoR) alternatives

A merchant of record is legally the seller. It calculates, collects, files and remits sales tax and VAT worldwide, and it handles disputes and fraud. The founder gets one payout and one invoice from the MoR, which removes the need to register for VAT in the EU, the UK and elsewhere.

| Provider | Headline fee (official unless noted) | Notes |
|---|---|---|
| Paddle | **5% + $0.50** per checkout transaction | Covers tax, fraud, chargebacks, buyer support. Custom pricing for high volume and for transactions under $10. Owns ProfitWell (free metrics) since 2022 |
| Lemon Squeezy (Stripe-owned since July 2024) | **5% + $0.50**, plus +1.5% international, +1.5% PayPal, **+0.5% subscriptions**, +5% on abandoned-cart recoveries | Payout to non-US banks costs 1%. Being folded into Stripe Managed Payments; reports in 2026 disagree on how far that has gone |
| Stripe Managed Payments | **+3.5% per successful transaction on top of standard Stripe fees** | Covers tax in 80+ countries, fraud, disputes, transaction support through Link. Works with Checkout and Payment Links only (no Elements, no Connect). Subscriptions need Billing, so expect 2.9% + $0.30 + 3.5% + 0.7% for a US card subscription (about 7.7% on $49) |
| Polar | Starter: **5% + $0.50**, no monthly fee; Pro $20/month: 3.8% + $0.40; Growth $100/month: 3.6% + $0.35; Scale $400/month: 3.4% + $0.30; +1.5% for non-US cards | Stripe payout fees are passed through ($2/month of active payouts plus 0.25% + $0.25 per payout). Popular with developer-tool founders |

**When indie founders choose an MoR (2026 consensus):**
- They sell B2C or prosumer software to many countries, especially the EU and UK, where non-resident sellers of digital services must charge VAT from the first sale.
- They are non-US founders, or solo founders who do not want to register in many jurisdictions.
- Revenue is under roughly $1–2M ARR, where the extra 2–4 points of fees cost less than a tax compliance function. Above that, many switch to Stripe plus Stripe Tax (or Avalara or Anrok) plus an accountant.
- B2B founders who invoice US businesses often stay on Stripe directly, because most of their sales are B2B and outside VAT for the seller (the business customer reverse-charges it) and US SaaS is taxable in only some states.

---

## 2. Startup banking

### 2.1 Providers in 2026

| Provider | What it is in 2026 | Key facts |
|---|---|---|
| Mercury | Fintech, not a bank. Deposits held at partner banks (Choice Financial Group, Column N.A.) | Sweep network gives up to **$5M FDIC coverage**. Checking pays 0%. **Mercury Treasury** needs $250K across accounts; net yield **3.01–3.81% by tier** (Rho comparison, dated 2026-08-02); fees from 0.15% of deposits. Treasury holdings are SIPC-covered (up to $500K), not FDIC. IO corporate card: 1.5% cashback, no personal guarantee. Plans: free; Plus about $35/month; Pro about $350/month. Received **conditional OCC approval for a national bank charter in April 2026** |
| Brex | **Acquired by Capital One; deal closed April 7, 2026** (Capital One newsroom and 10-Q; about $4.5B per SEC filing) | Corporate card and spend management; Essentials $0/user, Premium $12/user. Business account is non-interest-bearing; yield through its treasury product |
| Relay | Fintech for small businesses (Thread Bank / program banks) | Up to 50 checking sub-accounts (profit-first style budgeting); plans $0, $30, and $90–120/month |
| Big banks (Chase, BofA, etc.) | Traditional | Branches, lines of credit, worse software. Many founders keep a second account here after the 2023 SVB collapse |

**Lesson from March 2023 (SVB):** keep operating cash under FDIC limits or in a sweep, hold reserves in T-bills or money-market funds through a treasury product, and keep a second bank with one to two months of payroll.

### 2.2 What transactions look like (for the bank clone)

Typical descriptors and amounts a solo SaaS founder sees on a Mercury-style ledger:

| Type | Example description | Direction and pattern |
|---|---|---|
| Stripe payout (ACH in) | `STRIPE TRANSFER ST-A1B2C3` | Daily, net of fees and refunds, arrives T+2 after the charge. Amount never equals gross MRR |
| MoR payout | `PADDLE.COM PAYOUT` / `LEMON SQUEEZY` | Monthly or twice monthly, net of fees and tax |
| Card spend | `ANTHROPIC`, `OPENAI`, `AWS EMEA`, `VERCEL INC.`, `GOOGLE *WORKSPACE`, `CURSOR AI POWERED IDE`, `GITHUB`, `NOTION LABS` | Monthly recurring; LLM API spend is variable and grows with usage |
| Payroll debit | `GUSTO NET PAY`, `GUSTO TAX`, `DEEL` | Semi-monthly; separate debits for net pay, payroll taxes, benefits |
| Contractor (ACH or wire out) | `ACH TO J DOE` / `WIRE TO ...` | Wires cost $0–$25 depending on bank; international wires add FX spread |
| Tax payments | `IRS USATAXPYMT`, `DE DIV OF CORPORATIONS`, `CA FTB` | Quarterly estimates, annual franchise tax |
| Investment in | `WIRE FROM <FUND> LLC` | SAFE or priced round proceeds |
| Treasury sweep | `TRANSFER TO TREASURY` | Moves idle cash into T-bill or money-market funds |
| Interest/yield | `TREASURY DIVIDEND` | Monthly |

### 2.3 Typical solo founder monthly spend, 2026 (list prices checked October 2026; ranges are designer estimates built from them)

| Line | Typical monthly range | Basis |
|---|---|---|
| AI coding tools (Cursor, Claude subscription, etc.) | $20–$400 | Cursor: Pro $20, Pro+ $60, Ultra $200 (third-party 2026 summaries). Claude: Pro $20 monthly ($17 annual), Max from $100 (claude.com/pricing) |
| LLM API inference for the product | $0–$500 pre-revenue; then **about 10–30% of revenue for AI-heavy products** | Claude API list prices (October 2026): Haiku 5.5 $0.10/$0.50, Sonnet 5.5 $2/$10, Opus 5.5 $4/$20 per million input/output tokens; ICONIQ finds inference averages 23% of revenue at scaling-stage AI B2B companies |
| Hosting, database, storage | $20–$300 | Vercel, Render, Fly, Supabase or Neon paid tiers start at $20–$25/month each; AWS or GCP usage varies |
| Email, auth, monitoring, analytics | $0–$150 | Free tiers cover most solo apps until thousands of users |
| Google Workspace or similar | $7–$22 per user | Business Starter roughly $7–8.40, Standard roughly $14–17 (2025 list prices; check the live page) |
| Domains | $1–$10 (annualized) | $10–$70 per year per domain |
| Bookkeeping software or service | $0–$500 | See section 3.5 |
| Banking | $0–$35 | Mercury and Relay free tiers suffice |
| Payment fees | about 3–4% of revenue (Stripe) or 5–8% (MoR) | Section 1 |
| Legal and compliance (annualized) | $50–$300 | Registered agent, Delaware tax, filings; much more in a fundraise |
| Founder health insurance (US, if not on a partner's plan) | $400–$900 | Designer estimate; varies by state and age |

---

## 3. Accounting for SaaS

### 3.1 Cash vs accrual

- **Cash basis**: record revenue when money arrives and expenses when paid. It is simple, fine for a tiny LLC's tax return, and misleading for SaaS with annual plans.
- **Accrual basis (GAAP)**: record revenue when earned and expenses when incurred. Investors, acquirers and lenders expect it. C-corps with average gross receipts over the IRS small-business threshold (about $31M in 2025, inflation-adjusted) must use accrual for tax, but almost all VC-backed startups keep accrual books from the first fundraise.
- Practical 2026 pattern: books on accrual monthly (deferred revenue, prepaid expenses, accrued payroll), with the CPA making tax adjustments.

### 3.2 ASC 606 revenue recognition (the five steps)

1. Identify the contract (subscription terms accepted at checkout, or a signed order form).
2. Identify performance obligations (software access, onboarding, support; usually one for self-serve SaaS).
3. Determine the transaction price (list price minus discounts, plus variable or usage consideration estimated with constraint).
4. Allocate the price to obligations (by standalone selling price when there is more than one).
5. Recognize revenue as each obligation is satisfied. SaaS access is recognized **ratably over the service period**.

**Annual plan example:** a customer pays $1,200 upfront on January 1.
- Jan 1: Debit Cash (via Stripe clearing) $1,200, Credit Deferred Revenue $1,200.
- Each month-end: Debit Deferred Revenue $100, Credit Subscription Revenue $100.
- Cash in January is $1,200, revenue is $100, and MRR is $100. The game should show all three numbers separately, because confusing them is a classic founder error.

**Stripe fees:** record revenue gross, fees as an expense (cost of revenue: merchant fees). Payouts arrive net, so use a "Stripe clearing" bank-type account to reconcile gross charges, fees, refunds, disputes and payouts.

**Sales tax and VAT collected** are liabilities, not revenue.

### 3.3 Chart of accounts for a SaaS startup

| # | Account | Type | Notes |
|---|---|---|---|
| 1000 | Operating checking (Mercury) | Asset | |
| 1010 | Reserve / treasury (T-bills, MMF) | Asset | |
| 1050 | Stripe clearing | Asset | Gross charges in, fees/refunds/payouts out; should net to Stripe balance |
| 1060 | MoR clearing (Paddle, Lemon Squeezy, Polar) | Asset | If applicable |
| 1100 | Accounts receivable | Asset | Invoiced B2B customers |
| 1200 | Prepaid expenses | Asset | Annual software, insurance |
| 1500 | Computer equipment | Asset | Capitalize above your threshold (e.g. $2,500) |
| 1510 | Accumulated depreciation | Contra-asset | |
| 1600 | Capitalized software development (if policy) | Asset | Many early startups expense instead |
| 2000 | Accounts payable | Liability | |
| 2100 | Credit card payable (IO, Brex, Ramp) | Liability | |
| 2200 | Accrued expenses | Liability | |
| 2300 | Payroll liabilities | Liability | |
| 2400 | Sales tax / VAT payable | Liability | Collected tax owed to states or countries |
| 2500 | Deferred revenue | Liability | Unearned annual and prepaid revenue |
| 2700 | SAFE notes / convertible notes | Liability or equity | Per counsel and auditor guidance |
| 3000 | Common stock | Equity | |
| 3100 | Preferred stock | Equity | After a priced round |
| 3200 | Additional paid-in capital | Equity | |
| 3900 | Retained earnings | Equity | |
| 4000 | Subscription revenue | Revenue | Recognized ratably |
| 4100 | Usage revenue | Revenue | |
| 4200 | Services / onboarding revenue | Revenue | |
| 4900 | Refunds and discounts | Contra-revenue | |
| 5000 | Hosting and infrastructure | COGS | Production only; dev and staging go to R&D |
| 5010 | AI inference / LLM API (production) | COGS | Often the largest COGS line for AI products in 2026 |
| 5020 | Third-party software embedded in product | COGS | Email delivery, auth, maps |
| 5100 | Merchant and MoR fees | COGS | Stripe, Paddle fees (some companies put these in G&A; be consistent) |
| 5200 | Customer support and success | COGS | Salaries and support tools |
| 6000 | R&D salaries and contractors | OpEx: R&D | |
| 6010 | Dev tools and AI coding tools | OpEx: R&D | Cursor, Claude, GitHub |
| 6020 | Dev and staging hosting, eval inference | OpEx: R&D | |
| 6100 | Advertising | OpEx: S&M | |
| 6110 | Sales and marketing salaries, commissions | OpEx: S&M | |
| 6120 | Marketing software | OpEx: S&M | |
| 6200 | G&A salaries | OpEx: G&A | |
| 6210 | Legal | OpEx: G&A | |
| 6220 | Accounting and tax prep | OpEx: G&A | |
| 6230 | Business software (Workspace, Notion) | OpEx: G&A | |
| 6240 | Insurance | OpEx: G&A | |
| 6250 | Bank fees | OpEx: G&A | |
| 6260 | State taxes and franchise fees | OpEx: G&A | Delaware franchise tax |
| 7000 | Interest income (treasury) | Other income | |
| 7100 | Interest expense | Other expense | |
| 8000 | Income tax expense | Tax | |

Splitting COGS from OpEx is what makes gross margin meaningful. AI inference used by customers is COGS; inference used for internal coding is R&D.

### 3.4 Monthly close checklist

Target: closed within 5–10 business days of month-end (solo founders with an AI bookkeeper often close in 1–3 days).

1. **Bank and card feeds**: confirm all accounts are connected and complete through the last day (Mercury, card, treasury, PayPal).
2. **Categorize transactions**: review the AI-suggested categories and fix anything flagged low-confidence. Check vendor rules for new vendors.
3. **Reconcile Stripe**: gross charges − refunds − disputes − fees = net payouts ± change in Stripe balance. Use the Stripe Payout Reconciliation report. Do the same for any MoR.
4. **Reconcile bank and card accounts** to statement ending balances.
5. **Revenue recognition**: release deferred revenue for annual plans; book new annual prepayments to deferred revenue; check that recognized revenue roughly ties to MRR.
6. **Accruals**: accrue unbilled expenses (usage-based AI API bills that arrive after month-end, contractor hours, payroll from the last days of the month).
7. **Prepaids**: amortize annual software and insurance.
8. **Payroll**: tie the payroll provider report to payroll expense and liabilities.
9. **Sales tax and VAT**: record collected tax as a liability; check filing calendar; check nexus thresholds (Stripe Tax monitoring).
10. **Fixed assets**: book purchases above the capitalization threshold and depreciation.
11. **Review the P&L month over month**: investigate any line that moved more than 20% or $500. Watch AI inference/COGS against revenue.
12. **Balance sheet review**: Stripe clearing near zero difference, no stale uncleared items, deferred revenue reasonable.
13. **Metrics pack**: MRR movements, cash, burn, runway, gross margin (section 4).
14. **Lock the period** in the accounting system and save the reports (P&L, balance sheet, cash flow) for investors or your CPA.

### 3.5 Bookkeeping options in 2025–2026

- **Bench shut down on December 27, 2024**, with little notice (about 12,000–35,000 customers by various reports). Employer.com announced it would acquire and revive it, and customers were sent to Kick first. The lesson for the game: own your data, export monthly, and make sure your books live in a standard ledger (QuickBooks, Xero or an exportable GL), not only inside a service.
- AI-first bookkeeping (2025–2026): **Kick** (free until about $15K in business expenses, then from roughly $20–$50/month on its plan guide; third-party listings differ), **Digits** (autonomous general ledger, launched March 2025; about $65–$99/month per business per third-party listings), plus QuickBooks and Xero with built-in AI categorization.
- Human-backed services: **Pilot** (published figures vary from about $199 to $499+/month for startup tiers; the Core tier is commonly quoted at $499–$849/month in 2026), plus independent bookkeepers and fractional CFOs.
- **Game values:** DIY with AI tools $0–$100/month; AI bookkeeping with human review $100–$300/month; full-service startup bookkeeping $400–$900/month; year-end tax return and 1099s extra (C-corp return with a CPA is a designer estimate of $1,000–$3,500).

---

## 4. Taxes and compliance (US-centric, general information)

### 4.1 R&D expenses: Section 174 and the 2025 tax law

- 2017 TCJA rule, effective for tax years starting in 2022: R&E costs, explicitly including **software development**, had to be capitalized and amortized over 5 years (15 for foreign R&E). Many profitable-on-paper but cash-poor startups owed tax for the first time in 2022–2024.
- **One Big Beautiful Bill Act (signed July 4, 2025)** added **Section 174A**: domestic R&E is deductible in the year incurred for tax years beginning after December 31, 2024. Taxpayers may instead elect to amortize over at least 60 months. **Foreign R&E stays on 15-year amortization**, which matters for founders who use offshore contractors.
- Small businesses (average gross receipts under about $31M) could amend 2022–2024 returns to expense retroactively; the deadline was about July 2026 (sources say July 4 or July 6, 2026), so in October 2026 that window has generally closed. Others can deduct the remaining unamortized 2022–2024 amounts over one or two years.
- The R&D tax credit (Section 41) is separate; qualified small businesses can offset up to $500K a year of payroll tax with it.

### 4.2 Delaware C-corp obligations

- **Annual report + franchise tax due March 1** each year for the prior year (official). Annual report filing fee **$50**. Late: **$200 penalty plus 1.5% interest per month**.
- **The authorized-shares trap.** Delaware's default bill uses the **Authorized Shares Method**: $175 for 5,000 shares or fewer; $250 for 5,001–10,000; **+$85 per additional 10,000 shares**; maximum $200,000. A typical startup with 10,000,000 authorized shares gets a bill of about **$85,165**. The **Assumed Par Value Capital Method** usually gives the minimum **$400**: (total gross assets ÷ issued shares) × authorized shares, taxed at $400 per $1M (or portion), minimum $400. You must file with gross assets and issued shares to use it; you pay the lower amount. Founders who panic and pay the default bill are a classic, expensive mistake.
- Corporations owing $5,000 or more pay estimates (40% June 1, 20% Sept 1, 20% Dec 1, rest March 1).
- **Delaware LLC: flat $300 annual tax due June 1**, no annual report.
- A registered agent is required (about $50–$300 a year; designer estimate). Foreign qualification is needed in the state where you actually operate (California also charges an $800 minimum franchise tax).

### 4.3 Sales tax (US)

- Since *South Dakota v. Wayfair* (2018), states can require out-of-state sellers to collect once they pass **economic nexus** thresholds, usually **$100,000 in sales** in the state (some still also use 200 transactions; a growing number, including Illinois from Jan 1, 2026, have dropped the transaction count; California and Texas use $500,000).
- **SaaS taxability varies by state.** Taxable in states such as Texas (80% of the charge), New York, Pennsylvania, Washington, Ohio, Tennessee and others. Not taxable in California, Florida and several others. Sources conflict on some states; check each state's revenue department or use Stripe Tax, Anrok or Avalara.
- Stripe Tax monitors thresholds, but **you still have to register** in each state before collecting (or use Tax Complete or an MoR).

### 4.4 EU and UK VAT on digital services

- **EU:** a non-EU business selling digital services (SaaS) to EU consumers must charge VAT at the customer's country rate **from the first sale**; the €10,000 threshold applies only to EU-established sellers. Register once through the **Non-Union OSS** scheme in one member state and file a quarterly return (due the end of the month after each quarter). B2B sales to VAT-registered businesses are reverse-charged; collect and validate the customer's VAT ID.
- **UK:** overseas sellers of digital services to UK consumers must register for UK VAT from the first sale (no threshold for non-established businesses); the rate is 20%.
- This is the main reason indie founders choose an MoR.

### 4.5 Other recurring items

- **Form 5472**: a foreign-owned US single-member LLC must file Form 5472 with a pro forma Form 1120 each year, **even with no income**, by April 15 for calendar-year filers (Form 7004 gives a 6-month extension). The penalty is **$25,000 per form per year** (IRC §6038A). Foreign-owned C-corps also file 5472 for reportable related-party transactions.
- **1099s:** for payments made in **2026 and later, the 1099-NEC/MISC threshold rises from $600 to $2,000** (OBBBA), inflation-indexed from 2027. Forms are due to recipients and the IRS by January 31. Collect a W-9 before the first payment. **Form 1099-K** thresholds (issued by Stripe or PayPal) reverted to **$20,000 and more than 200 transactions**.
- **Quarterly estimated taxes (LLCs and sole proprietors):** a single-member LLC is disregarded, and the owner pays income plus 15.3% self-employment tax through Form 1040-ES on **April 15, June 15, September 15 and January 15**. The safe harbor is to pay 100% of last year's tax (110% if prior-year AGI exceeded $150K). C-corps pay estimates on April 15, June 15, September 15 and December 15 (calendar year), at the 21% federal rate.
- **Federal returns:** C-corp Form 1120 is due April 15 (calendar year); S-corp 1120-S and partnership 1065 are due March 15.
- **BOI (Corporate Transparency Act):** a March 2025 FinCEN interim rule exempted US-formed companies and US persons from BOI reporting; only foreign-formed companies registered in the US must file. 2024 guidance that every startup must file is out of date.
- **83(b) election** within 30 days of a restricted stock grant (no extension, no fix).
- **409A valuation** before granting options (VC-backed), refreshed at least every 12 months or after a priced round.

---

## 5. SaaS metrics and analysis

### 5.1 MRR movements (ChartMogul, Baremetrics, ProfitWell and Stripe Billing analytics use the same shape)

ChartMogul's six movement types: **New Business, Expansion, Contraction, Churn, Reactivation, Neutral**.

- **New business MRR**: first subscription from a never-paying customer.
- **Expansion**: an existing customer's MRR goes up (upgrade, seats, usage).
- **Contraction**: MRR goes down but the customer stays. **Discounts count as contraction** in ChartMogul.
- **Churn**: a customer cancels their last subscription (MRR goes to zero).
- **Reactivation**: a previously churned customer starts paying again.
- **Neutral**: plan switch at the same price.
- Net new MRR = New + Expansion + Reactivation − Contraction − Churn.
- Normalization rules: annual plans count as price ÷ 12; quarterly as price ÷ 3; exclude one-time fees, setup, taxes; trials count as 0 MRR until the first payment. Policy for past-due subscriptions differs by tool (some keep them in MRR during dunning, then backdate churn). Pick one rule and say which.

### 5.2 Core formulas

| Metric | Formula | 2026 reference points |
|---|---|---|
| Logo churn (monthly) | customers lost in month ÷ customers at start of month | B2C 5–10%+; SMB 2–5%; enterprise under 1% (typical ranges) |
| Gross revenue churn | (churned + contraction MRR) ÷ starting MRR | |
| Net revenue retention (NRR) | (start MRR + expansion − contraction − churn) ÷ start MRR, for a cohort over 12 months | Private SaaS median about 101–102% (Benchmarkit, SaaS Capital); ChartMogul: only 2.7% of companies with ARPA under $10 exceed 100%, against 41.1% with ARPA over $500 |
| Gross revenue retention (GRR) | same without expansion; capped at 100% | Median about 84% (Benchmarkit CY2025, via secondary source) |
| Quick ratio (SaaS) | (new + expansion + reactivation) ÷ (contraction + churn) | Above 4 is strong (Mamoon Hamid, Social Capital, 2015) |
| ARPA | MRR ÷ paying customers | |
| LTV | ARPA × gross margin % ÷ monthly revenue churn | Cap the lifetime (e.g. 5 years) when churn is low |
| CAC | sales and marketing spend (including salaries) ÷ new customers | Fully loaded and by channel |
| CAC payback (months) | CAC ÷ (ARPA × gross margin %) | Under 12 months is good for SMB |
| Burn multiple | net burn ÷ net new ARR (David Sacks, April 2020) | Sacks's scale: under 1 amazing, 1–1.5 great, 1.5–2 good, 2–3 suspect, over 3 bad |
| Rule of 40 | revenue growth % + profit (EBITDA or FCF) margin % | Most meaningful from about $10M ARR |
| Gross margin | (revenue − COGS) ÷ revenue | Traditional SaaS 75–85%; AI-native products about 41% (2024), about 45% (2025), projected 52–53% (2026) per ICONIQ; Bessemer cites 50–60% for AI against 80–90% for SaaS |
| Runway (months) | cash ÷ average net burn (last 3 months) | |
| Default alive | assuming expenses stay flat and revenue keeps growing at the recent rate, do you reach profitability before cash runs out? (Paul Graham, "Default Alive or Default Dead?", October 2015; Trevor Blackwell's calculator) | |

### 5.3 Cohort retention tables

Rows are signup (or first-payment) months; columns are months since start; cells are % of customers still active (logo) or % of starting MRR retained (revenue, can exceed 100% with expansion). Read down a column to see if newer cohorts retain better (the product is improving) and along a row to see where the curve flattens. A curve that never flattens means no product-market fit for that segment.

### 5.4 AI-heavy SaaS margins in 2025–2026

- ICONIQ's State of AI snapshot (January 2026) finds inference averages **23% of revenue** at scaling-stage AI B2B companies and does not fall much with scale (secondary coverage; primary report not accessed).
- Heavy users on flat-rate plans can cost more than they pay. The 2026 response: usage or credit-based pricing, model routing (cheap models for most calls), prompt caching, batch APIs (50% discount on Claude's Batches API), and per-customer margin dashboards.
- Track **gross margin per customer** and **inference cost per active user** weekly, not just overall gross margin.

### 5.5 What founders actually look at weekly (2026 practice)

1. Cash in bank and runway (bank dashboard).
2. MRR and net new MRR broken into movements (Stripe Billing analytics, ChartMogul or Baremetrics).
3. New trials or signups, activation rate, trial-to-paid conversion.
4. Churn and contraction this week, with reasons (cancellation survey).
5. Failed payments and recovery (Stripe revenue recovery dashboard).
6. AI inference spend vs revenue (provider console plus a usage table).
7. Pipeline for B2B: deals by stage and expected close.
8. Disputes and refunds (Stripe dashboard).
Monthly: the close, P&L, gross margin, burn multiple, cohort table, NRR/GRR.

---

## 6. Obsolete advice (2016 → 2026)

| 2016 advice | Why it is wrong or incomplete in 2026 |
|---|---|
| "Ignore sales tax and VAT until you are big." | Wayfair (2018) created economic nexus; non-EU and non-UK sellers owe VAT from the first consumer sale. Use Stripe Tax or an MoR from day one. |
| "Stripe's 2.9% + 30¢ is your payment cost." | Real cost for subscriptions is about 4–5% domestic with Billing and Tax, about 6–7% international; MoRs cost 5–8%. Disputes now cost $15 plus $15 to counter. |
| "Software R&D is deductible as you spend it." | True in 2016, false for 2022–2024 (5-year amortization), true again for domestic R&E from 2025 under §174A. Foreign contractors still trigger 15-year amortization. |
| "Software gross margins are 80%+." | AI-native products run about 45–55%. Inference is COGS and must be priced in. |
| "Bank wherever your VC banks (one bank)." | SVB failed in March 2023. Use sweep networks, treasury products and a second bank. |
| "Idle cash earns nothing, don't bother." | Treasury products pay roughly 3–4% in 2026; that is real runway. |
| "Hire Bench or a local bookkeeper and forget it." | Bench shut down overnight in December 2024. AI bookkeepers do categorization; you still review and must own exports of your ledger. |
| "Cash-basis spreadsheets are fine until Series A." | Annual plans and investor diligence require accrual books and deferred revenue from the first fundraise. |
| "Pay the Delaware franchise tax bill you get." | Still a trap: recompute with the assumed par value method. |
| "Issue 1099s to anyone paid $600." | $2,000 threshold for 2026 payments. |
| "Every startup must file BOI reports." | US companies exempt since March 2025. |
| "Growth at all costs; burn is fine if growing." | Investors screen on burn multiple, default alive and Rule of 40. |
| "Up to 1% chargebacks is fine." | Stripe flags above 0.75%; Visa VAMP excessive threshold is 1.5% (from April 2026) including fraud reports. |
| "Build your own metrics in spreadsheets / ProfitWell free forever." | Stripe Billing, ChartMogul, Baremetrics give MRR movements automatically; an AI agent can compute cohorts from a Stripe export in minutes, but definitions must be checked. |
| "Seat-based pricing is the default." | AI products move to usage or credit pricing (Stripe acquired Metronome for usage billing) to protect margins. |

---

## 7. Simulation parameters

| Parameter | Game value | Source + date |
|---|---|---|
| Stripe US domestic card fee | 2.9% + $0.30 | stripe.com/pricing, checked 2026-10-14 |
| International card surcharge | +1.5% | stripe.com/pricing, 2026-10-14 |
| Currency conversion | +1% | stripe.com/pricing, 2026-10-14 |
| Manually entered card | +0.5% | stripe.com/pricing, 2026-10-14 |
| ACH Direct Debit | 0.8%, cap $5 | stripe.com/pricing, 2026-10-14 |
| Stripe Billing fee | 0.7% of billing volume | stripe.com/pricing, 2026-10-14 |
| Stripe Tax fee | 0.5% per taxed transaction (no-code); Tax Complete from $90/mo | stripe.com/pricing, 2026-10-14 |
| Dispute fee | $15 received (kept) + $15 to counter (refunded if won) | stripe.com/pricing 2026-10-14; counter fee since 2025-06-17 (vendor blogs) |
| Smart Disputes | 30% of recovered amount | stripe.com/pricing, 2026-10-14 |
| Instant payout | 1.5%, $0.50 min | stripe.com/pricing, 2026-10-14 |
| Refund fee | Original fees not returned | Stripe support article, 2026 |
| Payout delay (settlement) | T+2 business days | docs.stripe.com/payouts, 2026-10 |
| New account first payout hold | 7–14 days after first live charge (game: 7, risky industries 14) | docs.stripe.com/payouts, 2026-10 |
| Dispute rate | B2B 0.1–0.3%; B2C 0.5–0.8% of charges | Vendor data: Sift Q3 2025 avg 0.26%; SaaS/digital 0.54–0.8% (2025–2026); B2B split is designer estimate |
| Dispute danger thresholds | Stripe 0.75%; Visa VAMP excessive 1.5% (from 2026-04-01) | docs.stripe.com/disputes/measuring; vendor coverage of Visa VAMP, 2026 |
| Renewal charges failing first attempt | 5–15% (B2C high end) | Vendor estimates 2025–2026 (unverified); designer range |
| Involuntary churn (after recovery), monthly MRR | Enterprise 0.3–0.8%; SMB 0.8–2.0%; consumer 1.5–3.0%; about one-third of total churn | Chargehive (vendor, 2025–2026); Recurly benchmarks (July 2026 data, period ambiguous) |
| Failed-payment recovery (all Stripe tools) | 55% average; Smart Retries alone 25–40% | stripe.com/billing (2026); vendor blogs 2025–2026 |
| Refund rate | 1–3% of charges | Designer estimate; Adapty mobile median 2.7% (2025) |
| Paddle (MoR) | 5% + $0.50, all-in | paddle.com/pricing, 2026-10-14 |
| Lemon Squeezy (MoR) | 5% + $0.50; +1.5% intl; +0.5% subscriptions; +1.5% PayPal | docs.lemonsqueezy.com fees, 2026-10-14 |
| Stripe Managed Payments (MoR) | +3.5% on top of Stripe fees (+0.7% Billing for subscriptions) | stripe.com/managed-payments, 2026-10-14 |
| Polar (MoR) | 5% + $0.50 (Starter); +1.5% non-US cards; paid tiers to 3.4% + $0.30 | polar.sh pricing, 2026-10-14 |
| Treasury yield | 3.0–3.8% net (Mercury tiers, needs $250K) | Rho comparison citing mercury.com, 2026-08-02 |
| FDIC sweep coverage | Up to $5M (Mercury) | Multiple 2026 sources |
| AI coding tools | $20–$400/mo | Cursor plans (2026 third-party); claude.com/pricing 2026-10 |
| LLM API (product) | $0–$500/mo pre-revenue; 10–30% of revenue for AI-heavy SaaS | Claude API prices 2026-10; ICONIQ 23% avg (Jan 2026, secondary) |
| Hosting/DB/storage | $20–$300/mo | Provider list prices; designer range |
| Google Workspace | $7–$22/user/mo | 2025 list prices |
| Domains | $10–$70/yr each | Designer estimate |
| Email/auth/monitoring | $0–$150/mo | Designer estimate |
| Bookkeeping | DIY+AI $0–$100; AI+human $100–$300; full service $400–$900 /mo | Kick, Digits, Pilot pricing (2026, partly third-party) |
| AI SaaS gross margin | 45–55% (traditional SaaS 75–85%) | ICONIQ State of AI (2025–2026, secondary); Bessemer 2026 |
| Delaware franchise tax + annual report | Due March 1; $400 + $50 typical (APVC method); default bill ~$85K for 10M authorized shares; late $200 + 1.5%/mo | corp.delaware.gov, 2026-10-14 |
| Delaware LLC tax | $300, due June 1 | Delaware Division of Corporations |
| Federal C-corp return | Form 1120, April 15; estimates Apr 15, Jun 15, Sep 15, Dec 15 | IRS rules (general) |
| LLC owner estimated tax | Apr 15, Jun 15, Sep 15, Jan 15; SE tax 15.3% | IRS 1040-ES rules |
| Form 5472 (foreign-owned SMLLC) | April 15 with pro forma 1120; $25,000 penalty per form/year | IRC §6038A; vendor guides 2026 |
| 1099-NEC | $2,000 threshold for 2026 payments; due Jan 31 | OBBBA (2025); payroll vendor summaries 2026 |
| 1099-K (from Stripe) | $20,000 and >200 transactions | OBBBA (2025) |
| Sales tax nexus | $100K sales per state (some 200 transactions; CA/TX $500K) | State rules via 2026 guides |
| EU VAT (non-EU seller) | From first B2C sale; Non-Union OSS quarterly | EU VAT rules; 2026 guides |
| UK VAT (overseas seller) | From first B2C sale, 20% | HMRC rules (general) |
| R&D expensing | Domestic: expense (2025+); foreign: 15-yr amortization | OBBBA §174A, signed 2025-07-04 |
| Stripe Atlas | $500 one-time | stripe.com/pricing, 2026-10-14 |

### Compliance calendar (calendar-year Delaware C-corp, US founder)

| Date | Item | Typical cost |
|---|---|---|
| Jan 15 | Q4 individual estimated tax (LLC owners) | Varies |
| Jan 31 | 1099-NEC to contractors paid ≥ $2,000 (2026 payments onward); W-2s; Q4 941 | $0–$100 in software |
| Mar 1 | Delaware annual report + franchise tax | $450 typical with APVC; more if large assets |
| Mar 15 | S-corp (1120-S) and partnership (1065) returns | CPA fees |
| Apr 15 | C-corp Form 1120 (or Form 7004 extension), Form 5472 if foreign-owned, Q1 estimates | CPA $1,000–$3,500 (designer estimate) |
| Apr 30 / Jul 31 / Oct 31 / Jan 31 | EU Non-Union OSS VAT returns (if selling B2C to EU without an MoR) | Software or agent fees |
| Jun 1 | Delaware LLC $300 tax; first Delaware corp estimate if tax ≥ $5,000 | $300 |
| Jun 15 / Sep 15 / Dec 15 | Corporate estimated taxes (if profitable); Jun 15 and Sep 15 for individuals | Varies |
| Oct 15 | Extended individual and C-corp returns due | |
| Monthly/quarterly | State sales tax returns where registered | Stripe Tax Complete from $90/mo, or an MoR |
| Within 30 days of stock grant | 83(b) election | Free, but irreversible if missed |
| Annually / before option grants | 409A valuation (VC-backed) | Designer estimate: low thousands of dollars |

---

## Sources

Official and primary:
- Stripe pricing (checked 2026-10-14): https://stripe.com/pricing
- Stripe payouts docs: https://docs.stripe.com/payouts
- Stripe measuring disputes: https://docs.stripe.com/disputes/measuring
- Stripe Billing page (55% recovery, $8.2B recovered in 2025): https://stripe.com/billing
- Stripe Radar pricing: https://stripe.com/radar/pricing
- Stripe Managed Payments: https://stripe.com/managed-payments and https://docs.stripe.com/payments/managed-payments/how-it-works
- Stripe support, fees on refunded payments: https://support.stripe.com/questions/understanding-fees-for-refunded-payments
- Paddle pricing: https://www.paddle.com/pricing
- Lemon Squeezy fees: https://docs.lemonsqueezy.com/help/getting-started/fees
- Polar pricing: https://polar.sh/resources/pricing
- Delaware franchise tax: https://corp.delaware.gov/frtaxcalc/ and https://corp.delaware.gov/paytaxes/
- Capital One completes acquisition of Brex (April 2026): https://www.capitalone.com/about/newsroom/capital-one-completes-acquisition-of-brex/
- Claude pricing: https://claude.com/pricing ; Claude API prices from Anthropic model table (cached 2026-10-06)
- ChartMogul MRR movements: https://help.chartmogul.com/hc/en-us/articles/4416682609426
- ChartMogul SaaS Retention Report: https://chartmogul.com/saas-retention-report/
- Recurly churn benchmarks (July 2026 data): https://recurly.com/research/churn-rate-benchmarks/
- David Sacks, "The Burn Multiple" (April 2020): https://sacks.substack.com/p/the-burn-multiple-51a7e43cb200
- Paul Graham, "Default Alive or Default Dead?" (October 2015): http://paulgraham.com/aord.html

Secondary and vendor (treat with care):
- Stripe dispute fee change: https://www.chargeflow.io/blog/stripe-dispute-fees-2025 ; https://justt.ai/blog/stripe-dispute-fee
- Visa VAMP 2026: https://justt.ai/blog/visa-vamp-threshold-changes-april-2026/ ; https://fraud.net/resources/visas-vamp-thresholds-drop-to-1-5-on-april-1-are-you-ready
- Chargeback averages: https://www.chargeback.io/blog/average-e-commerce-chargeback-rate ; https://fungies.io/prevent-win-chargebacks-digital-products-2026
- Involuntary churn: https://www.chargehive.com/blog/involuntary-vs-voluntary-churn-saas
- Refund rates (mobile): https://adapty.io/blog/refund-rate-metrics-and-benchmarking/
- Mercury treasury yields: https://www.rho.co/treasury-yield-comparison
- Banking comparison: https://www.rho.co/blog/mercury-vs-brex-vs-rho-startup-banking-comparison
- Bench shutdown: https://www.geekwire.com/2024/vancouver-fintech-company-bench-accounting-announces-sudden-shutdown/
- Bookkeeping pricing: https://kick.co/faq ; https://docs.kick.co/accountants/reference/plan-comparison-guide ; https://www.capterra.com/p/186313/Pilot/pricing/ ; https://toolradar.com/guides/best-ai-bookkeeping-tools
- Section 174A: https://www.bakertilly.com/insights/domestic-research-expenditures-section-174-under-obbba ; https://www.aprio.com/the-one-big-beautiful-bill-makes-domestic-r-e-expenditures-deductible-again-ins-article-tax
- 1099 thresholds: https://onpay.com/insights/1099-reporting-threshold-updates/
- Form 5472: https://www.sdocpa.com/form-5472-foreign-owned-business-filing/
- Sales tax nexus: https://www.commenda.io/guide/economic-nexus-by-state
- EU OSS: https://helpdesk.hellotax.com/hc/en-150/articles/49817186344209-Non-Union-OSS-for-Non-EU-Digital-Service-Providers
- AI gross margins (ICONIQ, Bessemer coverage): https://www.saastr.com/iconiqs-latest-state-of-ai-report-the-10-most-important-data-points-for-saas-founders ; https://www.cloudzero.com/blog/ai-gross-margin
- Cursor pricing: https://www.jetadmin.io/blog/cursor-pricing-explained-plans-credit-system-and-real-costs-in-2026/
- Merchant of record 2026 comparison: https://alexcloudstar.com/blog/merchant-of-record-indie-saas-2026/
