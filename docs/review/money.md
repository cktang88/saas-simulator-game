# Realism review: money (Bank, Payments, Books, Analytics, Personal finance, Financing)

Reviewer pass on 2026-10-14. Scope: `public/core/{stripe,bank,personal,params,clock}.js`, `public/apps/{bank,stripe,books,analytics,financing}.js`, `public/apps/money/*`, `public/data/lenders.js`. No code was changed. The sim scripts are in the scratchpad (`review-money/`) and reproduced at the end.

## Summary

The core accounting holds up. Over 365 simulated days (B2C, SMB and enterprise), money is conserved to the cent: ledger cash net of fees, refunds and disputes equals payouts posted plus the Stripe balance (diff $0.00). The balance sheet balances, all four tie-outs pass, and deferred revenue matches open service periods. Fee levels, dispute rates and the 55–57% failed-payment recovery rate match the research.

The serious problems are in **financing and personal money**:

1. Every lender product, including Stripe Capital, RBF, SBA and business lines of credit, pays out to the founder's **personal** account. It is then repaid as an amortized personal loan **and** has its fee deducted upfront, so financing cost is charged roughly twice.
2. Approval odds are never applied, because `approvalOdds` is a string. Every application is approved, and the offer table shows "~NaN% approval odds".
3. Credit cards turn their whole limit into cash at 0%.
4. FICO falls to 300 within a few months of a negative personal balance and never recovers.
5. A C-corp founder salary is booked as an owner draw, with no payroll taxes and no P&L expense.

In payments, the main gaps are:

- Enterprise invoices are charged card fees (4.1% of volume, versus about 0.7% for ACH) and are paid on the day they are issued (no net-30 terms, no accounts receivable).
- Expired cards cause 30–40% of all failed attempts because the account updater isn't applied before the charge. This pushes SMB involuntary churn to 2.3% of MRR per month, above the 0.8–2.0% benchmark.
- Payouts arrive T+3 business days and land on Saturdays.
- The FX fee is charged on every non-US card, even though the charge is in USD.

## Measured numbers (365 days, seed 42; `sim-payments.mjs`)

| Metric | B2C $9.99/mo | SMB $49/mo | Ent $18k/yr (invoice) | Benchmark |
|---|---|---|---|---|
| Stripe fees, % of gross | 7.49% | 4.83% | **4.10%** | US card $49: 4.2% (research §1.1). B2C $9.99 ≈ 6.6% US-only (the 30¢ dominates, which is realistic). Invoice paid by ACH: 0.8% capped at $5, plus 0.7% Billing ≈ 0.73% |
| Invoices with ≥1 failed attempt | 8.1% | 5.7% | 4.8% | 5–15% first-attempt failures (research §1.4) ✓ |
| Share of failures that are `expired_card` | 32% | 40% | – | Vendor claim: up to 30% *before* updater; with the updater included, expired-card failures should be a small share |
| Failed-payment recovery | 57% | 56% | – | Stripe: 55% across tools ✓ |
| Involuntary churn, % of MRR per month | 3.0% | **2.3%** | 0% | Consumer 1.5–3.0%, SMB 0.8–2.0% (Chargehive). B2C is at the top of the range; SMB is above it |
| Refunds (first charges refunded) | ≈2.2% | ≈0.8% | 0 | 1–3% (design) ✓ |
| Dispute rate, % of charges | 0.55% | 0.18% | 0 | B2C 0.5–0.8%, B2B 0.1–0.3% ✓ |
| Disputed subscriptions still billing afterwards | 14 of 45 | 4 of 7 | – | Merchants cancel on chargeback; otherwise they get repeat disputes |
| Money conservation diff | $0.00 | $0.00 | $0.00 | ✓ |
| Balance sheet balanced / 4 tie-outs | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ |

**Payout timing** (`sim-payout.mjs`, SMB, US card):

| Charge | Lands in Mercury | Real Stripe |
|---|---|---|
| First live charge, Tue Nov 3 | Fri Nov 20 (17 days) | 7–14 days |
| Mon Nov 23 | Thu Nov 26 (T+3 business days; also Thanksgiving) | Wed (T+2) |
| Wed Nov 25 | **Sat Nov 28** | Weekend and holiday payouts arrive the next business day |

**Solo-founder tool spend** (`sim-fullgame.mjs`): the default stack is **$161/month** (Workspace $14, Claude Max $100, Vercel $20, Supabase $25, domains $2). That is realistic for a lean 2026 stack (research §2.3: AI tools $20–400, hosting $20–300). The game also charges a $160 one-off "Cloud provider" overage. Hosting does not scale with customer count.

**Personal runway** (defaults: $20k savings, $3.5k/month living costs, $300/month debt, quit job):

- Savings go negative in month 5. The founder is forced into a full-time job (paid $6,750/month net from the next month) in month 7.
- **FICO falls 720 → 300** and stays there even after savings recover.

**Loan offers** (`sim-loans.mjs`; full list in the script output):

| Profile | Main offers |
|---|---|
| A: W-2 $120k, FICO 760, in notice period | Prime personal loan $72k at **7.44%**; credit-union loan $48k at 8.28%; 0% card $24k; 401(k) loan $30k |
| B: quit, FICO 720, no income | Only Kiva $15k ✓ |
| C: homeowner, FICO 780 | HELOC $100k at 7.3% ✓; SBA 7(a) $150k (odds "low") ✓ |
| D: $10k MRR, 12 months, quit | Stripe Capital $12.5k (12% fee); online line of credit $15k at 27.5%; SBA 7(a) $63k |
| F: $30k MRR, 24 months | RBF $76k (1.5× cap); SBA 7(a) $350k at 11.5% |

**Booking a business financing product through Financing → Apply** (`takePersonalLoan`):

| Product | Offer | Contract repays | Founder actually received | Game charged | Repaid from |
|---|---|---|---|---|---|
| Stripe Capital | $37,500 | $42,000 | $33,000 | $45,000 | Personal savings |
| RBF | $76,000 | $114,000 | $38,000 | $115,192 | Personal savings |

The cost of financing is roughly doubled.

## Findings

| id | sev | file:line | What's unrealistic | Evidence | Real-world benchmark (source, date) | Fix |
|---|---|---|---|---|---|---|
| M1 | critical | `apps/financing.js:204-227` → `core/personal.js:34-58` | Business financing (Stripe Capital, RBF, SBA 7(a)/Express/Micro, online and bank lines of credit, business 0% card) lands in the **personal** account. It is repaid as a fixed amortized personal payment, and `feePct` is also deducted from the proceeds even though the RBF/Capital APR already prices the fee. | Stripe Capital: $33,000 received, $45,000 repaid (contract: $37,500 / $42,000). RBF: $38,000 received, $115,192 repaid (contract: $76,000 / $114,000) | Stripe Capital: the fee is "not charged upfront; it's paid over the length of the financing" and is withheld as a % of daily Stripe sales, starting 1–2 business days after funding ([docs.stripe.com/capital/servicing](https://docs.stripe.com/capital/servicing), fetched 2026-10-14) | For `kind ∈ {rbf, sba_*, line_of_credit}` and `cc_business_0apr`, post the proceeds to the company bank (`category:'loan'`), net of the upfront fee only for SBA/Micro (`feePct`). For `rbf`, set `feePct = 0` at booking and store `totalRepay`. Stripe Capital should be repaid in `stripeDay` by withholding `repaymentPctOfRevenue` (default 0.15) of each charge's net before it goes to `pending`, until `totalRepay` is reached, with a minimum of 1/18 of the total every 60 days (Stripe loan minimum). RBF is repaid monthly from the company bank at 8% of last month's gross. Reuse the existing company-side engine in `fundraising/sim.js:317,505` instead of duplicating it |
| M2 | high | `apps/financing.js:130,222` vs `data/lenders.js:906-911` | `approvalOdds` is `'high'\|'medium'\|'low'` (a string), but the UI computes `Math.round(odds*100)` and `rng() > odds`. The result is "~NaN% approval odds", and **no application is ever declined**. | Every approved row in `sim-loans` returns a string, so `rng() > 'high'` is always false | Fed Small Business Credit Survey 2025: 52% of applicants fully approved (research doc §7) | Map the strings to probabilities, `{high:0.85, medium:0.55, low:0.2}`, in both places. Show "High / Medium / Low odds" in the UI |
| M3 | high | `core/personal.js:37,51`; `data/lenders.js` `uwCreditCard` | Credit cards (0% personal and business) are booked as a lump of **cash** equal to the full limit, at 0% intro APR. | A $24,000 card limit becomes $24,000 of personal savings | Cash advances cost 3–5% (min $10), at ~25–30% APR with no grace period, and are limited to **20–30% of the credit line** ([chime.com/blog/cash-advance-fee](https://www.chime.com/blog/cash-advance-fee/), 2026-08-26; [wealthvieu cash-advance limits](https://wealthvieu.com/credit-cards/fees-interest/cash-advance-limits-by-card/)) | Make a card a **payment method**. Add `state.personal.cards[{limit, balance, introUntil}]` and let Bank "pay with founder's personal card" for card-acceptable spend (recurring tools, ads), which is reimbursed later or booked as a founder loan. Allow cash advances up to 25% of the limit, with a 5% fee and 29.99% APR from day 1. Count the minimum payment (1% + interest, min $35) in `monthlyDebtPayments` (it is currently excluded from DTI). Model a utilization hit: >30% → −20 FICO, >70% → −45 |
| M4 | high | `core/personal.js:89-100` | A negative personal balance subtracts 40×(months missed) FICO points per month, which compounds. FICO hits 300 and **never recovers**. Within 2 months the founder also gets a $108k full-time job instantly. | 720 → 300 in four months; still 300 after savings are positive again | A 30-day late drops a 720 score to about 630–650 (−70 to −90); a 780 drops 90–110; recovery takes ~2.5–3 years ([financialsamurai.com](https://www.financialsamurai.com/how-one-late-payment-can-kill-your-credit-score/) citing FICO data; [fool.com](https://fool.com/the-ascent/credit-cards/articles/heres-what-happens-when-you-have-strong-credit-and-are-late-with-a-payment/)) | First missed month: `fico -= fico>=760?100 : fico>=700?80 : 60`. Each further month: −15 (60/90-day lates). Floor at 500 until month 6 (charge-off: an extra −50). After 3 clean months, recover +5/month toward the pre-delinquency score. Job search: 60–120 days (draw uniformly; not offered instantly), at `priorW2Income × 0.9` |
| M5 | high | `core/clock.js:44-46`; `apps/money/ledger.js:59` (`owner_draw → 3300`) | A C-corp founder "salary" is booked as an equity draw. There is no employer FICA, no payroll provider, and no P&L expense. Net income and the 21% income tax are therefore overstated, and gross burn is understated by the ~7.65% employer FICA (≈$300/month on a $4k salary). | Code path: every founder salary goes to `category:'owner_draw'` | Corporate owner-employees must be paid W-2 wages through payroll; draws are for sole props, LLCs and partnerships ([onpay.com owners draw vs salary](https://onpay.com/payroll/process/pay-yourself-owners-draw-vs-salary/); [relayfi.com](https://relayfi.com/blog/how-to-pay-yourself-business-owner/)) | If `entity==='ccorp'`, post `payroll` (gross) plus `payroll_tax` (gross × 0.0765, plus FUTA $42/year and SUTA ≈ 2.7% on the first $7–12k), and add the Gusto recurring charge ($49 + $6/person, `params.COMPANY.gusto`). Personal net ≈ gross × (1 − 0.0765 − 0.12). For an LLC/sole prop, keep `owner_draw`, but don't tax the draw. Instead, accrue 1040-ES: 15.3% SE tax plus ~12% on profit, paid on the existing quarterly dates |
| M6 | high | `core/stripe.js:154-186` (`invoiceManually`) | Enterprise invoices are (a) charged **card** fees: 2.9% + 0.7% + intl, 4.1% of volume, $738 on an $18k invoice; and (b) paid the same day with 97% success. There is no net-30 term, no accounts receivable, and no late payers. | Ent fee 4.10% of $360k = $14,766/year | ACH Direct Debit is 0.8% capped at $5; Invoicing 0.4% (research §1.1, stripe.com/pricing 2026-10-14). Enterprise net-30/60 DSO is 50–75 days ([launchrock DSO benchmarks](https://www.launchrock.com/library/expert-advice/days-sales-outstanding), 2025) | For `invoiceManually`, set `fee = min(5, 0.008×amt) + 0.007×amt`, or 0.004×amt if the player chooses "Invoicing only". Issue the invoice with `dueDay = day + 30`. Draw the payment day from a lognormal with median due + 10 days (p90 at due + 45). Book it to an AR account (`1100`, Dr AR / Cr deferred revenue at issue, Dr clearing / Cr AR at payment). Add a "send reminder" action (0.1h) that pulls the payment forward |
| M7 | medium | `core/stripe.js:58,165-168` | Card expiry is uniform over 0–3 years and fails 100% on the first attempt, even though the account updater is "included". Expired cards make up 32–40% of failures, and the 10% per-retry success drives SMB involuntary churn to 2.3%/month. | See the measured-numbers table | Updater is included with Stripe; Recurly measured ~1.9 pts fewer declines after enabling it, with a larger effect in B2C ([recurly.com account updater results](https://recurly.com/blog/results-account-updater-for-recurring-billing/)). SMB involuntary churn benchmark is 0.8–2.0%/month (research §1.4) | At renewal, if the card is expired: with p=0.75 the updater already refreshed it (`expiresDay += 1095`, no failure). Otherwise fail with `expired_card`, and give retry success 0.25 with dunning emails on (customers update via the hosted page). Target SMB involuntary churn ≈ 1.2–1.5% |
| M8 | medium | `core/stripe.js:149`; `apps/stripe.js:213,225` | The FX +1% is added to **every** non-US card although prices and settlement are both USD, so no conversion happens. This overstates fees by 0.25–0.35 points of volume. | B2C 7.49% vs 7.14% without FX; SMB 4.83% vs 4.58% | Stripe converts only when the charge currency ≠ settlement currency ([docs.stripe.com/currencies/conversions](https://docs.stripe.com/currencies/conversions)) | Add FX only when `plan.currency !== 'usd'` (or when Adaptive Pricing is on). Fix the UI label and the research worked example ("European card *with conversion*") accordingly |
| M9 | medium | `core/stripe.js:180,313`; `params.js:21-22` | (a) Payouts arrive T+3 business days. (b) Payouts initiated on Friday arrive Saturday. (c) US bank holidays are ignored. (d) The first payout takes 17 days. | See the payout timing table | "Payouts scheduled on weekends or holidays arrive on the next business day"; US settlement is 2 business days; first payout within 7–14 days ([docs.stripe.com/payouts](https://docs.stripe.com/payouts), fetched 2026-10-14) | `arrivalDay = availableDay` (the payout is created and lands on the same business day). Roll weekend/holiday arrivals to the next business day using a holiday list (New Year's Day, MLK Day, Presidents' Day, Memorial Day, Juneteenth, July 4, Labor Day, Columbus Day, Veterans Day, Thanksgiving, Christmas). First payout: `firstChargeDay + 7` calendar days (`firstPayoutHoldDays: 7`, risky/annual-prepay: 14). Add a payout schedule setting (daily/weekly Mon/monthly 1st/manual) and **Instant payout** (1.5%, $0.50 minimum) |
| M10 | medium | `core/stripe.js:286-301` | After a chargeback the subscription keeps billing the same card. 14 of 45 disputed B2C subscriptions were still active. A fraud dispute leaves the card usable. | sim-payments | Industry practice: cancel on dispute and block the card; a stolen card is reissued by the issuer | On dispute open: `endSub(..., 'disputed')` and mark the card `blocked`. Also: a refund issued after a dispute opens should be refused (Stripe blocks refunds on disputed charges) — it already is via `status !== 'succeeded'` ✓ |
| M11 | medium | `core/stripe.js:101-111` | A **new non-trial** subscription whose first payment fails is set to `past_due` and counted as **new MRR**. | Code path; ~5% of B2C new subscriptions | Stripe: the first invoice of a new subscription that fails goes `incomplete` and expires after 23h; it is not MRR | If `isNew && !ok && !sub.trialEndDay`: `status='incomplete'`, no MRR event, cancel (`incomplete_expired`) the next day with p=0.7 (otherwise the customer retries with another card) |
| M12 | medium | `apps/money/ledger.js:59`; `core/bank.js` (no interest category) | `loan_repayment` maps the whole repayment to liability 2600. Interest and RBF fees never reach the P&L, and 2600 goes **debit-negative** once total repayments exceed principal (RBF 1.5× → a −50% "liability"). | Code path (fundraising RBF posts `loan_repayment` for principal+fee, `fundraising/sim.js:505`) | Research §3.3 COA lists 7100 Interest expense | Add category `interest_expense` (kind `expense`) and COA `7100 Interest expense`. Split each repayment into principal (→2600) and interest/fee (→7100), using the effective-interest method or straight-line fee over the expected term. Also include debt service in `trailingBurn` (currently excluded via `FINANCING`): runway must count repayments |
| M13 | medium | `data/lenders.js:955,992,1032` | Personal APR = band minimum + DTI interpolation. With low DTI, everyone gets the advertised floor, e.g. FICO 760 → 7.44%. | Profile A | Credible closed loans, Oct 2025–Sep 2026: 740–799 avg **12.35%**, 670–739 19.23%, 580–669 28.42% (research §7) | Center on Credible: `apr = clamp(credibleAvg(fico) × (0.85 + 0.5×dti/maxDti) ± 1.5×noise, b.aprMin, b.aprMax)`. Credible table: {800:9.67, 740:12.35, 670:19.23, 580:28.42, 0:29.85} |
| M14 | medium | `apps/financing.js:226`; `data/lenders.js` `fundingDays` | All products fund instantly. `fundingDays` is ignored (SBA 7(a) 30–90 days, Kiva 30–60 days, RBF 21 days). | Code path | sba.gov; Kiva via research §3.6 | Queue the loan with `fundDay = day + fundingDays` (SBA: 45 ± 15; Kiva: 30–60 and funds only if network ≥ X). Re-run underwriting at funding |
| M15 | medium | `core/state.js:69`; `main.js:264` | The company has a Mercury account and $30k on day 0 although `incorporated=false`. | Setup | Mercury requires a state-registered LLC/corp/partnership with an EIN; no sole props, no "EIN pending" ([merchantmaverick Mercury review](https://www.merchantmaverick.com/reviews/mercury-banking-review); [invoicebloom](https://invoicebloom.io/blog/how-to-open-a-mercury-account), 2026) | Before incorporation, run "company" money through a personal checking account (or Novo/Found for sole props). Mercury opens 1–3 business days after Legal sets `incorporated` + EIN (an EIN online is instant for US persons) |
| M16 | medium | `core/bank.js:75-81`; `core/clock.js:74-86` | When checking is overdrawn, card bills and tools keep charging (the balance can go far negative), although the UI says "Cards are declining". There is no Stripe negative-balance debit. | sim: post() never checks the balance | Mercury has no overdraft; debit/IO card authorizations decline when funds are short | In `chargeRecurring`: if `balance < amount`, record a declined attempt, retry in 3 days, and set `r.active=false` after 3 declines (vendor suspends; product hosting suspension → `setModifier('churn','hosting-suspended',1.5)`) |
| M17 | medium | `core/stripe.js:147`; `apps/stripe.js:509` | MoR toggle: payouts stay daily T+2 under "Stripe"; disputes still come to the founder for evidence; all subscriptions switch instantly. | Code path | Paddle-style MoRs pay out monthly or twice monthly, net of tax (research §2.2) and own disputes. Migrating subscriptions requires a card-data migration or re-checkout (weeks) | Under MoR: payouts on the 1st and 15th; disputes handled by the MoR (no evidence UI; chargeback amount still deducted); a migration window of 14–30 days during which 5–10% of subscribers fail to migrate |
| M18 | medium | `apps/money/ledger.js:451-466`; `apps/books.js` close | Close items other than "categorize" and "lock" are tick boxes. "Reconcile Stripe" and "Reconcile bank" need no input, so the close is too easy. Accruals and prepaids are N/A boxes with no journal entries. | UI review | QuickBooks: reconcile = enter the statement ending balance and tick cleared items; the difference must be $0 (research §3.4) | Reconcile Stripe/bank: the player types the statement ending balance (shown in Bank/Stripe), and the step blocks unless it matches the ledger within $0.01. Add manual journal entries (accrue AI API usage billed next month; prepaid annual tools amortized over 12 months) |
| M19 | low | `params.js` MARKET.ent + `core/state.js:9` | The enterprise default plan is $1,500/**year** ($125 MRR). `refPrice: 1500` is compared to the *monthly* price, so `priceFactor` saturates at 2.5 for the default plan. Setup copy says "$15k+/year". | `market.js` `priceFactor` | ACV $15k+ | Default ent plan: `price: 18000, interval: 'year'`. Keep `refPrice: 1500` (monthly-equivalent) and document it as monthly |
| M20 | low | `core/stripe.js:216` | Refund probability ignores interval: annual B2C plans refund more. | – | Adapty: annual 6–7.6% vs ~2.7% overall (research §1.5) | `refundRate × (interval==='year' ? 2.5 : 1)` |
| M21 | low | `apps/bank.js` treasury `transfer()` | Treasury redemptions are instant. Interest is paid on the month-end balance only. | – | MMF/T-bill redemptions settle T+1 | Mark Treasury → checking transfers as arriving the next business day |
| M22 | low | `core/bank.js` stack; catalog `health` | Hosting is flat at $45 regardless of users. Health insurance can be added as a company expense while it is also inside personal living costs (double count). | sim-fullgame: hosting $45 at any scale | Vercel/Supabase usage pricing | Add a variable hosting bill of $0.02–0.10 per active B2C subscriber and $0.30–1.00 per SMB account per month. Remove health from the company catalog, or subtract it from `monthlyLivingCosts` when added |
| M23 | low | `apps/financing.js:17,220` | Each hard pull costs −5 FICO permanently. | – | Inquiries are scored for 12 months (research §7) | Store each inquiry's day and add back 5 points 365 days later |
| M24 | low | `apps/stripe.js` | Missing real Stripe actions: partial refunds, coupons/promo codes, proration on upgrades, a customer-portal cancel flow with a retention offer, trial-ending reminder emails (the main B2C dispute driver), and Radar/card-testing. | UI review | research §1.3–1.4 | Prioritize: (1) a trial-reminder toggle that halves B2C disputes on first charges and lowers trial conversion by ~5% relative; (2) partial refund; (3) coupons as contraction MRR |

## Things that ARE realistic (keep them)

- **Money conservation and books.** Payouts reconcile exactly to charges − fees − refunds − disputes. Stripe clearing, deferred revenue and bank tie-outs match. The balance sheet balances in every run. ASC 606 ratable recognition is correct, refunds and disputes are split between deferred and contra-revenue, and cash vs accrual views are both available.
- **Fee schedule** (`params.PAYMENTS`): 2.9% + 30¢, +1.5% international, 0.7% Billing, 0.5% Stripe Tax, $15 dispute fee + $15 counter fee (refunded on a win), 5% + 50¢ MoR. The fee is kept on refunds.
- **Rates.** Dispute rates (B2C 0.55%, SMB 0.18%), the 0.75% Stripe and 1.5% VAMP thresholds, recovery of ~55% with Smart Retries plus dunning emails, and the 3-week retry window (3/5/7/7 days).
- **Grandfathering** on price changes; price migrations need 30+ days' notice and judged notice emails.
- **Delaware and federal taxes.** The franchise-tax APVC vs authorized-shares trap ($400 vs $85,165), late penalties ($200 + 1.5%/month), the 1099-NEC $2,000 threshold, the 80% NOL limit, Non-Union OSS from the first B2C sale, and nexus thresholds ($100k; CA/TX/NY $500k).
- **Mercury.** Treasury $250k minimum and ~3–3.8% yield (Mercury's own page currently says "up to 3.97%"; [mercury.com/treasury](https://www.mercury.com/treasury)); free ACH and wires; W-9 before paying contractors.
- **Bookkeeping tiers** and AI miscategorization rates. The default $161/month tool stack.
- **Lender gating.** "Apply before you quit" (a quit founder gets only Kiva), the SBA citizenship rule from 2026-03-01, SBA spreads over prime, the 401(k) loan cap, HELOC CLTV, the Stripe Capital eligibility floor, and the RBF floor at $15k MRR.
- **Dispute evidence judge.** The prompt ("most merchants lose; be strict") and the heuristic. The win probability is `0.35 × (0.5 + quality)`, capped at ~52%, which is in line with published merchant win rates.

## Reproducible sim scripts

The scripts are in `/tmp/claude-0/-home-user-saas-simulator-game/206b90ee-2d53-5d73-b830-492c6c8aa766/scratchpad/review-money/`. Run them from the repo root.

```bash
node …/review-money/sim-payments.mjs b2c 365 42   # fees, failures, recovery, churn split, disputes, conservation, tie-outs
node …/review-money/sim-payments.mjs smb 365 42
node …/review-money/sim-payments.mjs ent 365 42
node …/review-money/sim-payout.mjs                # payout arrival days vs charge day
node …/review-money/sim-loans.mjs                 # underwrite 6 profiles; book Stripe Capital/RBF/card via takePersonalLoan
node …/review-money/sim-fullgame.mjs smb 300 1 0  # all APPS, default setup: tool spend, personal runway, FICO, ledger
```

Core of `sim-payments.mjs`:

```js
const s = newState({ companyName:'Acme', model, path:'indie', founderName:'Pat', seed });
s.apps ??= {}; s.flags ??= {}; s.status = 'playing';
ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
s.apps.product = { features:[{ id:'f1', title:'x', status:'shipped', shippedDay:0 }] };
s.company.website = { source:'url', url:'https://acme.test' };
post(s, { amount:50000, counterparty:'Pat', category:'owner_contribution' });
const apps = APPS.filter(a => ['bank','stripe','books','analytics'].includes(a.id));
for (let d=0; d<DAYS; d++) {
  for (let i=0, n=poisson(s, perDay); i<n; i++) { const c = createCustomer(s,{name:'c',email:'c@x'}); subscribe(s, c.id, plan, { trial:false, invoiceManually: model==='ent' }); }
  advance(s, 1, apps);
}
// conservation: Σ books.cash(gross − refunds − chargebacks − fees) == Σ stripe_payout txns + available + pending + in_transit
```

Core of `sim-loans.mjs` (the double-charge check):

```js
const r = LND.underwrite(profileF, LND.LENDER_PRODUCTS.find(p => p.id==='rbf_saas'));
takePersonalLoan(s, { kind:'rbf', amount:r.maxAmount, apr:r.apr, feePct:r.feePct, termMonths:r.termMonths });
// personal receives amount×(1−feePct/100) = $38,000; advance(term) → $115,192 debited from personal
```
