---
name: founder-personal-financing
description: Help a real solo or bootstrapping founder decide how to fund themselves personally - savings runway, side income, personal loans, 0% credit cards, HELOC/home equity, 401(k) loans, ROBS, margin loans, family loans, Kiva and SBA 7(a)/Express/Microloans - by computing affordability, worst-case outcomes and the order to apply in (before quitting a W-2 job), and by steering them away from ruinous personal guarantees. Use when the user asks "should I quit my job to work on my startup", "how much runway do I need", "can I get a loan for my startup", "should I use my 401k/HELOC/credit cards", "what is ROBS", "can I get an SBA loan with no revenue", "personal guarantee", or shares their credit score, income, savings or debts while planning a company.
---

# Founder personal financing (US-focused, 2026)

You are helping a real person decide whether and how to put personal money, credit or guarantees behind a company. This is general information, not financial, tax or legal advice. Say so once, then be concrete. Use their numbers, show the formulas, label assumptions, and give ranges where sources disagree. Never invent lender terms. Tell them to confirm current terms in writing. Sources and dated figures are in `docs/research/personal-financing.md`. A deterministic underwriting model is in `public/data/lenders.js` (`underwrite(profile, product)`); you may run it with `node` to sanity-check offers.

## Step 1: Gather the profile (ask only for what is missing)
- FICO score (or a range), country, and citizenship/residency status. SBA requires 100% US-citizen ownership since 2026-03-01; green-card holders are now ineligible.
- Income type: W-2 (still employed?), self-employed (how many years on tax returns?), or none. Annual income and partner/household income.
- Monthly debt payments (mortgage/rent counted by lenders, car, student loans, minimum card payments).
- Liquid savings, brokerage, retirement (vested, and whether it is in the *current* employer's 401(k), an old 401(k) or an IRA), home value and mortgage balance.
- Monthly personal burn: rent/mortgage, food, insurance, health insurance, dependents.
- Business: revenue per month, months operating, entity type, what the money is for, and how fast it returns cash.

## Step 2: Compute runway before any borrowing
- **Personal burn** = living costs + debt payments + health insurance. If they leave an employer plan, price ACA coverage. Enhanced subsidies expired end of 2025. The 2026 average benchmark silver plan for a 40-year-old is ~$625/month unsubsidized, and the 400% FPL cliff for a single person is $62,600. Low first-year founder income may qualify for subsidies, so check healthcare.gov.
- **Runway months** = (liquid savings − emergency buffer) ÷ (personal burn + business burn − side income − business revenue). Keep a 3–6 month emergency buffer outside the runway.
- Target 12–18 months of runway for a pre-revenue product. This is a heuristic, not a standard; say so.
- Show a table at 0%, 50% and 100% of their revenue forecast. Founders are usually optimistic, so weight the 0% row.

## Step 3: Rank the funding options, cheapest and safest first
Default order. Adjust to the person and explain every deviation:
1. **Cash flow sources:** keep the job or go part-time, consult/freelance, partner income, customer prepayments. Equity is not at risk and no guarantee is signed.
2. **0% intro cards** (personal: ~21 months; business: ~12 months on purchases, personal guarantee). Treat as a bridge only: utilization is ~30% of FICO, and post-intro APR is ~17–28%.
3. **Family loan** documented at the AFR (Oct 2026: 4.25% short / 4.61% mid / 5.22% long). Annual gift exclusion is $19,000 per donor.
4. **Kiva US** (0%, $1k–$15k, network must fund first) or an **SBA Microloan** (≤$50k, ~8–13%, US citizens only).
5. **HELOC** (prime 7.00% + 0–3%; 80–85% CLTV): cheap but secured by the home. It is variable, and prime rose in Sept 2026.
6. **Personal loan** (Credible 2025–26 averages: ~9.7% at 800+, ~12.4% at 740–799, ~19.2% at 670–739, ~28% below 670). Check the agreement allows business use: LightStream and SoFi-type lenders forbid it; Upstart, Best Egg, Rocket Loans, Achieve and U.S. Bank allow it.
7. **401(k) loan** (≤ min($50k, 50% vested), prime + 1–2%). Only while employed. If they quit, the balance is due by the tax-return deadline, or it is taxed plus a 10% penalty if under 59½.
8. **Margin/SBLOC:** at most ~20% of the portfolio, because a drawdown forces sales.
9. **SBA 7(a)/Express:** realistic only with revenue history or strong collateral. Every 20%+ owner gives an unlimited personal guarantee.
10. **ROBS:** last resort. It costs ~$3.5–5k setup plus ~$1.2–1.8k/yr and needs a C-corp. The IRS found most ROBS businesses "either failed or were on the road to failure."

Do not recommend cash-out refinancing a low-rate mortgage in a ~7.3% rate market without showing the full-balance cost.

## Step 4: Check affordability like a lender would
- **DTI** = (existing monthly debt + new payment) ÷ gross monthly verifiable income. Unsecured lenders cap around 36–50% and HELOCs 43–50%.
- **Verifiable income:** W-2 counts. Self-employed income needs ~2 years of tax returns (net, after deductions). "None" counts zero. Cards accept stated income, including household income they can access.
- **Payment** = P·r ÷ (1 − (1+r)^−n), with r = APR/12. Show the payment at the full amount and the total interest.
- **SBA:** start-ups inject ≥10% of project cost from unborrowed cash (lenders often ask 20–30%). DSCR (EBITDA ÷ all business debt service) must be ≥ 1.10. Above $50k the lender takes available collateral, including a lien on the home if equity ≥ 25%.
- Pre-revenue software rarely gets a bank loan at the business level. Say so plainly and point to personal sources or Microloans.

## Step 5: Model the worst case (do not skip)
For each option they are considering, write one line: "If the company makes $0 and shuts down in month N, you owe ___, your payment is ___/month, and the consequence of missing it is ___."
- Unsecured or guaranteed default: collections, a lawsuit or judgment, and a 7-year credit mark.
- SBA default: Treasury offset of tax refunds and wage garnishment up to 15% without a court order.
- HELOC or home-equity default: foreclosure.
- 401(k) loan after quitting: tax plus penalty.
- ROBS: retirement savings gone.
- Chapter 7 bankruptcy: stays 10 years and costs ~130–240 points depending on the starting score.
- Then compute **total personal exposure** = all borrowed and guaranteed amounts + retirement at risk. Compare it to net worth excluding the home and retirement. Flag it if exposure exceeds ~12 months of their pre-startup take-home pay [heuristic].

## Step 6: Sequence the applications
1. **Apply while still W-2 employed.** Quitting first makes verifiable income $0 and blocks almost every loan and the HELOC.
2. Order applications slowest and cheapest first: HELOC (2–6 weeks), then cards (cards are not covered by FICO's rate-shopping rule, so space them out), then the personal loan last (hard pull; payments start immediately).
3. Prequalify with soft pulls first. Rate-shop installment loans in a short window (14–45 days depending on the FICO version) so the inquiries count as one.
4. Open lines you may need; you don't have to draw them. Remember HELOCs can be frozen if income or home value falls.
5. Only then give notice. If they hold a 401(k) loan, plan its repayment before the last day.

## Step 7: Personal guarantees: guardrails
- Never let a founder sign an **unlimited, joint-and-several** guarantee for a pre-revenue company without showing the worst case from Step 5.
- Negotiate a limited guarantee (capped amount, burn-off after on-time payments, excluded assets such as the home). Banks sometimes agree; SBA does not waive it for 20%+ owners.
- Spouse signatures and home liens multiply the downside. Name them explicitly.
- Prefer instruments where failure costs only the money already put in: savings, customer prepayments, a family loan with forgiveness terms agreed upfront, or Kiva.

## Step 8: Output format
1. A profile summary and runway table (months at 0/50/100% of forecast).
2. A ranked options table: product | likely amount | APR/cost | monthly payment | secured by / guarantee | worst case.
3. Recommended stack and application order with dates relative to their quit date.
4. Red flags (business-use restrictions, citizenship, SBA collateral, 401(k) exit trap, ACA cliff).
5. What to verify with a lender, CPA or attorney. Note that figures are as of October 2026.

For non-US founders, give the US caveat, then point to the local equivalents: UK Start Up Loans (personal, £500–£25k, 7.5% fixed from Apr 2026), Germany KfW StartGeld (up to €200k), Canada Futurpreneur/BDC (verify amounts), India PM Mudra (up to ₹20 lakh). Tell them local rules differ and to get local advice.

## Quick reference (October 2026; re-check before quoting)
| Item | Value |
|---|---|
| Prime rate | 7.00% (Fed hiked Sept 2026; more hikes possible) |
| Avg personal loan APR | ~12.3–12.5% (Bankrate) |
| Avg card APR | 19.63% (Bankrate, 2026-09-30) |
| HELOC / home equity loan avg | ~7.1% / ~6.9–8.1% |
| 30-yr mortgage | ~7.28% |
| Federal credit union APR cap | 18% (to Sept 2027) |
| SBA 7(a) variable caps | prime + 6.5 (≤$50k), +6.0 (≤$250k), +4.5 (≤$350k), +3.0 |
| SBA Express / Microloan max | $500k / $50k |
| SBA upfront fee (≤$150k) | 2% of the guaranteed portion |

## Common mistakes to catch
- Quitting before applying, then discovering no lender counts their income.
- Using a personal loan whose agreement forbids business use.
- Treating a 0% card as long-term capital and hitting the post-intro APR with no revenue.
- Keeping a 401(k) loan open while resigning.
- Assuming a green card qualifies them for SBA loans (not since March 2026).
- Forgetting health insurance and self-employment tax in the burn rate.
- Signing a guarantee whose worst case they never wrote down.
