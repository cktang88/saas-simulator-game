# Personal financing for a solo founder: loans, cards, home equity, retirement money, SBA (research, October 2026)

Research date: 2026-10-14. Scope: how a solo US founder who bootstraps can borrow personally (or use a personal guarantee) to fund a software company in 2026, at what terms, and with which risks; plus short notes for UK, EU, Canada and India. This is general information, not financial, tax or legal advice.

**Confidence tags.** **[official]** = government, regulator or the provider's own page. **[editorial]** = NerdWallet/Bankrate/Credible-style reviews (affiliate-funded but data-driven). **[vendor]** = a company selling a related product, or a law-firm/lender blog. **[design]** = no authoritative number was found; this is a game assumption bracketed by sources. Code implementing all of this: `public/data/lenders.js`.

**Macro backdrop, October 2026.** The FOMC *raised* the fed funds target 25 bp to 3.75–4.00% on 2026-09-16 (effective 09-17), so the **bank prime rate is 7.00%** (FRED DPRIME = 7.00 on 2026-10-02) [official]. Prime had been 6.75% from the 2025-12-11 cut until September. The September minutes (released 2026-10-07) show most officials expected another hike by year-end [editorial: primerates.com, 2026-10-08]. 30-year mortgages averaged **7.28%** (Freddie Mac PMMS, week of 2026-10-01), above 7% for the first time since January 2025, with the 10-year Treasury above 5% [editorial: Trading Economics]. Rates are rising, not falling. That makes all variable-rate debt (HELOCs, SBA loans, margin) costlier and favors fixed-rate or 0% products.

---

## 1. Unsecured personal loans

### 1.1 Market averages
- Bankrate average personal-loan APR: **12.28%** (2026-06-10) and 12.54% (latest quoted on the page updated 2026-10-07). The typical range is 8–36% [editorial].
- Federal Reserve 24-month personal loan rate: **~11.40%** in early 2026 (via Finder) [official, secondary].
- **Credible marketplace average APR by FICO, closed loans Oct 2025–Sep 2026 (n = 73,513):** 800–850: **9.67%**; 740–799: **12.35%**; 670–739: **19.23%**; 580–669: **28.42%**; <580: **29.85%** [editorial]. For 720+ borrowers in the week ending 2026-10-11, the averages were 15.44% (3-year) and 18.93% (5-year). These look inconsistent with the band table because they come from a different population, so the game should use the band table.
- LendingTree consumer data, Q2 2025 (via Finder): 720+: 15.12%; 680–719: 23.35%; 660–679: 27.07%; 640–659: 29.39%; 620–639: 30.50%; 580–619: 32.17%; 560–579: 33.41% [editorial]. These are higher than Credible because the population includes subprime marketplace offers.
- MoneyLion tier averages, Sept 2026: excellent 14.95%, good 19.58%, fair 23.85%, poor 27.20%. The source is unnamed, so treat these as weak [editorial].
- **Takeaway for the game:** the APR spread between 760+ and 640 is about 15–20 points. Credit score moves the rate far more than the Fed does.

### 1.2 Lenders (published ranges, NerdWallet "October 2026" page and Bankrate 2026-10-07)
| Lender | APR | Amount | Term | Origination fee | Min FICO | Funding | Business use |
|---|---|---|---|---|---|---|---|
| SoFi | 6.99–35.49% (with discounts; rates as of 10/02/26) | $5k–$100k | 2–7 yr | 0–7% (SoFi Bank); 9.99% (Cross River loans) | not published | same day | **"any lawful personal, family, or household purposes"**: effectively no |
| LightStream (Truist) | 9.99–24.94% | $5k–$100k | 2–20 yr | none | 660 | same day | **No.** FAQ: "Loans are made to individuals for personal use, not to businesses… You may not use your loan proceeds for business purposes." Hard pull at application [official] |
| Happen Bank (LendingClub renamed in June 2026) | 5.96–35.99% | $1k–$75k (MoneyLion says $60k) | 2–7 yr | 0–8% | 600 | next day (66% within 24 h, Q2 2026) | not listed |
| Upgrade | 7.74–35.99% | $1k–$75k (others say $50k) | 2–7 yr | yes, range not stated | 580–600 | 1 day | not listed |
| Best Egg | 6.99–35.99% unsecured | $2k–$50k | 3–5 yr | 0.99–9.99% (≥4.99% for 4+ yr) | 600 | 1–3 business days | **Yes**, "business expenses" listed |
| Upstart | 6.20–35.99% | $1k–$75k | 3 or 5 yr | up to 12% | none (min income $12k) | 1 day | **Yes** |
| Discover (now Capital One) | 6.99–24.99% | — | — | — | — | — | not verified |
| U.S. Bank | 9.24–24.99% | $1k–$50k ($25k non-customers) | 1–7 yr | — | 680 | — | **Yes** (NerdWallet business-use list) |
| Rocket Loans | 7.99–29.99% | $2k–$75k | 3–5 yr | up to 9.99% | 640 | — | **Yes** |
| Achieve | 6.25–35.99% | $5k–$50k | 2–5 yr | yes | 640 | — | **Yes** (reports to only 2 bureaus) |
| Credit unions | ≤ **18%** cap for federal CUs (NCUA, extended to 2027-09-10); e.g. Patelco 9.30–17.90% | varies | varies | usually none | varies | days | varies |
| Marcus (Goldman) | **No new personal loans since Jan 2023** | | | | | | |

Sources: NerdWallet best personal loans (page titled October 2026; SoFi disclosure dated 10/02/26), NerdWallet personal loans for business (updated 2026-09-16), Bankrate personal loans (2026-10-07), LightStream FAQ, NCUA press release 2026-02-06, Happen Bank rebrand coverage (Finovate, NerdWallet 2026-08-10).

### 1.3 Business use of a personal loan
- Many prime lenders **prohibit business use** (LightStream explicitly; SoFi limits use to personal/family/household purposes; Marcus did). Others (Upstart, Best Egg, Rocket Loans, Achieve, U.S. Bank) explicitly allow business expenses [editorial: NerdWallet 2026-09-16].
- Breaching a use restriction is a contract default: "the lender could force you to immediately repay the loan in full" [editorial: Fox Business].
- Approval is based on **personal** credit, income and debt, not business revenue, so a pre-revenue founder can qualify **if they still have verifiable income** [editorial: NerdWallet].
- Interest is usually not deductible, but interest traced to business use can be. Keep records [editorial: NerdWallet].

### 1.4 Underwriting norms
- **DTI ceilings:** most lenders cap around 43%, prefer ≤35–36%, and some stretch to 50% for strong income [editorial: firstcard/financer 2026]. The game uses 40–45% [design].
- **Income:** W-2 verified by pay stubs or payroll data. Self-employed borrowers generally need **2 years** of history (Form 1040 + Schedule C or K-1, 1099s, bank statements, YTD P&L). Lenders count **net** income after deductions, not gross [editorial: MoneyLion 2026-08-05, Finder]. Some lenders accept 1 year if the rest is strong.
- **Credit pulls:** most online lenders prequalify with a **soft pull** and do a **hard pull** at acceptance. LightStream does a hard pull at application [official]. A hard inquiry usually costs <5 points, counts in scoring for 12 months and stays on the report for 2 years. Same-type loan shopping in a short window counts as one inquiry, but this does not apply to credit cards [editorial, citing FICO].
- **Max amount vs income:** lenders do not publish a rule. The game caps unsecured loans at 40–60% of verified annual income [design].
- **Time to fund:** same day to 5 business days.

---

## 2. Credit cards

### 2.1 Rates
- Bankrate weekly average card APR: **19.63%** (2026-09-30), down from the record 20.79% (2024-08-14) [editorial].
- LendingTree Q1 2026: 21.00% across all accounts; 21.52% on accounts accruing interest [editorial]. New-offer averages of 22–24% are quoted by secondary sites but unverified.
- A **10% APR cap** was called for by the President in January 2026, and bills exist (S.381 Sanders–Hawley; H.R. 1944). Not enacted in any source found [editorial, Jan 2026 coverage]. The game should treat it as a possible random event, not current law.

### 2.2 0% intro APR cards (terms seen in 2026 reviews; confirm with issuer)
| Card type | Intro | After intro | Fees | Notes |
|---|---|---|---|---|
| Wells Fargo Reflect (personal) | 0% for **21 months** on purchases and balance transfers (BT within 120 days) | 17.49% / 23.99% / 28.24% variable | BT 5% (min $5) | [editorial: Credit Karma 2026] |
| Citi Simplicity (personal) | 0% for **21 months** on BT, 12 months on purchases | — | BT 3% for the first 4 months, then 5% | |
| U.S. Bank Shield / BankAmericard | 18–21 billing cycles | — | BT ~5% | sources conflict |
| Chase Ink Business Unlimited / Cash | 0% for **12 months on purchases** | 16.74–24.74% (another source: 18.49–24.49%) | no annual fee | welcome bonus ~$750 |
| Amex Blue Business Plus / Cash | 0% for **12 months on purchases** | 16.74–26.74% | no annual fee | "flexible" spending limit |

Business-card intro APRs cover purchases only, not balance transfers [editorial: NerdWallet, Nav 2026].

### 2.3 Limits, utilization, guarantees
- No authoritative 2026 table of new-card limits by FICO exists. Experian's average total card limit was $33,980 in Q2 2024, and limits reportedly tightened in 2025 [editorial: Experian]. A first card with thin credit gets about $500–$2,500 [editorial]. The game sets the limit at **7–20% of stated income by FICO band**, capped at $25k (personal) or $50k (business) [design].
- Cards accept **stated income**. Under CARD Act ability-to-pay rules, applicants 21+ can count income they have reasonable access to, such as a spouse's. This is why a founder who quit can sometimes still get a card while every installment lender says no.
- **Utilization:** "amounts owed" is about **30%** of a FICO score. The highest scorers keep utilization under ~10%, and ≥30% hurts [editorial, citing FICO/Experian]. Running a card to its limit to fund a startup can cut a score sharply right when the founder needs more credit.
- **Business cards need a personal guarantee.** Most issuers report only serious delinquency or default to personal bureaus (Citi, U.S. Bank, Amex per most sources). **Capital One reports all activity** to personal reports. Chase sources conflict [vendor/editorial: Nav, Ramp 2026-02-16]. A sole proprietor with no revenue can apply on personal credit.

---

## 3. Secured and other personal sources

### 3.1 HELOC, home-equity loan, cash-out refinance
- **Rates:** HELOC average APR **7.08%**; home-equity loan **6.87%** (MonitorBankRates 2026-10-06; fourth straight weekly rise) [editorial]. Bankrate: HELOC 7.47% (2026-06-17), home-equity loan 8.08% (2026-07-22) [editorial]. Bankrate's January forecast of falling rates is stale.
- **Pricing = prime + margin.** 760+ gets about prime + 0 to 0.75; 680–699 gets about prime + 1.25 to 1.75; 680–719 gets about prime + 1.0 to 2.0 [editorial: primerates.com Mar 2026, Wealthvieu]. A 620 vs 760+ score costs 1.5+ points more.
- **CLTV:** most lenders cap at **~85%** combined LTV. One March 2026 wholesale sheet allows 90–95% only for high scores, caps 680–699 at 85% and 660–679 at 80% [editorial/vendor].
- **Credit and DTI:** minimum FICO 620–680 is typical (some want 720), and max DTI 43–50%. Some lenders compute the DTI payment on the full line [editorial: Achieve, Splash 2026].
- **Self-employed:** 2 years of personal and business returns, net income, often a CPA-prepared YTD P&L [editorial: The Mortgage Reports 2026]. Fannie Mae allows **12 months** of self-employment income on returns if prior income was in the same field [official: Selling Guide B3-3.2-01]. Bank-statement and asset-based programs exist at higher rates.
- **Cash-out refi:** conventional max **80% LTV**. With 30-year rates at ~7.3%, refinancing a low-rate mortgage reprices the whole balance and is usually worse than a HELOC.
- **Risks:** foreclosure, variable rate (prime just rose), and the line can be frozen or cut if home values or income fall.

### 3.2 401(k) loans [official: IRS Retirement Plans FAQs regarding loans]
- Max = the lesser of **$50,000** or the greater of $10,000 or 50% of the vested balance. Plans need not offer the $10k exception. The $50k cap is reduced by the highest outstanding balance in the prior 12 months.
- Repay within **5 years** (longer for a home purchase) in level payments at least quarterly, usually by payroll deduction.
- Interest is typically **prime + 1–2%** (so ~8–9% now), paid into your own account [editorial].
- **Leaving the employer:** most plans require full repayment. Otherwise the unpaid balance is **offset** and taxed as a distribution, plus a **10% penalty** if under 59½. For offsets caused by severance from employment, you can roll the offset amount over until your **tax-return due date including extensions** [official].
- Only your **current** employer's plan can lend. IRAs cannot, and former-employer plans generally don't issue new loans. **A founder who quits loses this option, and an existing loan becomes due.**

### 3.3 ROBS (Rollovers as Business Startups)
- Structure: form a **C-corp**, adopt a new 401(k), roll pre-tax retirement funds into it, and have the plan buy company stock. The founder becomes a W-2 employee. It is equity, not debt: no payments and no credit check [editorial: NerdWallet 2025-11-24].
- **Cost:** Guidant setup **$4,995** + plan administration **from $149/month** [vendor: Guidant pricing]. IRA Financial $3,500 + $1,200/yr; Pango $4,695 + $1,548/yr [vendor comparison]. Range: ~$3.5k–$5k setup, ~$1.2k–$1.8k/yr.
- **IRS view** (page updated 2025-11-16): ROBS are "not considered an abusive tax avoidance transaction" but are "questionable because they may solely benefit one individual." The compliance project found "most ROBS businesses either failed or were on the road to failure," with high rates of bankruptcy, liens and corporate dissolutions. **Form 5500 is required** (the one-participant exception does not apply). Problem areas include promoter fees, asset valuation and missing 1099-R reporting [official].
- Risk: retirement savings concentrated in a single startup, with no capital-loss deduction if it fails.

### 3.4 Securities-backed borrowing
- **Margin loan:** up to **50%** of marginable securities (Reg T). FINRA requires 25% minimum maintenance and brokers often set 30%+. Brokers can raise requirements and sell without notice [official rules; Raymond James disclosure].
- **Rates (Sept 21, 2026, $25k tier, IBKR's own comparison):** Interactive Brokers ~5.38%; Schwab and Fidelity ~11.58%; Vanguard 11.75%; E*Trade ~12.2% [vendor].
- **SBLOC:** typically advances more than margin, cannot be used to buy securities, and interest accrues monthly [official: Schwab]. A 2026 HNW survey: 37% used SBLOCs, 35% margin, 32% HELOCs [vendor: Long Angle, July 2026].
- **Risk:** a market drawdown forces sales at the bottom. At 50% LTV with 30% maintenance, a ~29% drop triggers a call (computed).

### 3.5 Family loans
- **October 2026 AFRs** (Rev. Rul. 2026-19, annual compounding): short-term (≤3 yr) **4.25%**, mid-term (3–9 yr) **4.61%**, long-term **5.22%** [official].
- Charge at least the AFR on loans over $10k to avoid below-market (imputed-interest) treatment under IRC §7872. Gift loans ≤$10k are generally exempt. Up to $100k, imputed interest is limited to the borrower's net investment income [background knowledge; verify with IRS Pub. 550/§7872].
- **Gift tax:** annual exclusion **$19,000** per donee (2025 and 2026); basic exclusion **$15,000,000** for 2026 (Public Law 119-21, signed 2025-07-04) [official: IRS gift-tax FAQ]. Forgiving a loan is a gift.

### 3.6 Kiva US
- **$1,000–$15,000 at 0% APR, no fees, 12–36 months.** It starts with a ~15-day private round in which your own network lends ≥$25 each, and takes 30–60 days end to end. Borrowers must live in the US, be 18+, use the loan for business, and not be in bankruptcy, foreclosure or under liens [editorial: StartupOwl review updated July 2026]. No official 2026 change was found.

---

## 4. Business loans a new founder can actually get

### 4.1 SBA rules that changed in 2025–2026
- **SOP 50 10 8** (effective 2025-06-01) replaced 50 10 7.1. It restored a **10% minimum equity injection** for start-ups and complete changes of ownership, and dropped the "do what you do" lender discretion. A seller note counts only if on full standby and ≤ half the injection [vendor: Whiteford law, Starfield & Smith 2025]. Collateral is again required **above $50k** (previously $500k): if business assets don't fully secure the loan, the lender liens personal real estate of 20%+ owners that has ≥25% equity [vendor: Lenders Cooperative, Live Oak].
- **Citizenship:** under SBA Policy Notice 5000-876441 (published 2026-02-02, effective **2026-03-01** for 7(a)/504; Microloans **2026-04-01**), **100% of direct and indirect owners must be US citizens or US nationals with principal residence in the US**. Lawful permanent residents and foreign nationals can no longer own *any* share. Loans with SBA numbers before 2026-03-01 are grandfathered [vendor/editorial: NAGGL, BRG, selfemployed.com 2026-04-16; GAO B-338157 dated 2026-07-01 discusses CRA applicability]. Under the June 2025 SOP, LPRs had been allowed.
- **SBSS score retired.** SBA stopped using the FICO SBSS score (the old 7(a) Small pre-screen of **165**) on **2026-03-01**. 7(a) Small lenders now use their own "generally accepted" credit analysis, must state why credit isn't available elsewhere, and must show **DSCR ≥ 1.10:1** on historical or 12-month projected cash flow, plus 2 months of business bank statements. SBA Express lenders may keep using business scoring models [official: Procedural Notice 5000-876777, published 2026-02-20].
- **Personal guarantee:** required from every **20%+ owner** [editorial: NerdWallet].
- **No official personal-FICO minimum.** Lenders typically want 640–680+, and start-ups 700+ with 20–30% injection [editorial/vendor 2026].

### 4.2 Program terms
| Program | Max | Guarantee | Rate cap (variable) at prime 7.00% | Term | Notes |
|---|---|---|---|---|---|
| 7(a) standard | $5M | 75% (>$150k) / 85% (≤$150k) | ≤$50k: P+6.5 = **13.5%**; $50–250k: P+6.0 = **13.0%**; $250–350k: P+4.5 = **11.5%**; >$350k: P+3.0 = **10.0%** | working capital up to 10 yr | [official: sba.gov] |
| 7(a) Small | $350k | as above | same | | DSCR ≥ 1.10; no SBSS |
| SBA Express | **$500k** | 50% | same caps | | lender scoring allowed |
| Microloan | **$50k** (avg ~$13k; FY2026 avg reported $15.4k) | n/a (nonprofit intermediaries) | typically **8–13%** | up to **7 yr** | citizenship rule since 2026-04-01 [official: sba.gov] |

- Fixed-rate caps (Apr 2026 table at 6.75% prime): ≤$25k 14.75%, $25–50k 13.75%, $50–250k 12.75%, >$250k 11.75% (i.e., P+8/7/6/5) [editorial: United Capital Source].
- **Upfront guaranty fee:** FY2026 loans ≤$150k with maturity >12 months pay **2% of the guaranteed portion** (lender may keep ≤25%). FY2027 (from 2026-10-01) keeps the 2% tier and adds a 0% fee for loans ≤$700k to manufacturers, food supply chain and rural businesses [official via NAGGL/Coleman Report].
- **Default:** delinquent SBA debt is referred to Treasury at ~120–180 days. Treasury Offset can take tax refunds and other federal payments, and **administrative wage garnishment up to 15% of disposable pay** needs no court order [vendor: law-firm blogs, 2025–2026].

### 4.3 What a pre-revenue software startup can actually get
- **Banks:** essentially nothing unsecured at the business level. 7(a) is technically open to start-ups, but lenders want projections, 20–30% injection, 700+ FICO and collateral. Software has no hard assets, so the realistic outcome is a decline or a loan secured by the founder's home and personal guarantee. Sources point pre-revenue founders to **Microloans** first [editorial: NerdWallet, sba7a.loans 2026].
- **Fed SBCS (2025 survey, released 2026):** only **52%** of employer-firm financing applicants were fully approved, and **54%** of firms with financial challenges used the owner's personal funds [official: Cleveland Fed, 2026 Main Street Metrics]. NORC 2024: 83% of US owners used personal assets for start-up costs. Kauffman: only 0.5% used VC at startup [vendor summary].
- **Online lenders (need revenue history):** OnDeck 625 FICO, 1 yr, $100k revenue (average LOC APR **57.10%**, Feb 2025). Fundbox 600, 6 months, $100k (another source: $30k/3 months), fees from 4.66% per 12 weeks. Bluevine 625, 12–24 months, ~$10k+/month, LOC APR ~20–50%. NerdWallet puts the overall APR-equivalent at **~10–80%** [editorial].
- **Bank LOC:** Wells Fargo BusinessLine $10k–$150k, 6+ months, FICO 680+, personal guarantee. Chase ~$100k revenue, FICO 660. Prime lines need 24 months and $2M revenue [editorial].
- **Revenue-based financing:** Lighter Capital floor $200k ARR or $15k MRR; Founderpath ≥$10k MRR; advance ~1/3 of ARR; repay 2–8% of revenue to a 1.35–2.0x cap (see `fundraising.md`).
- **Stripe Capital (US):** ≥3 months processing on Stripe, ≥$5k/yr, and an average ≥$1k/month over the last 3 months. The business must be US-based and representatives need a US home address. Meeting the minimums does not guarantee an offer [official: Stripe docs]. Flat fee reported at 8–20% [secondary].
- **Venture debt:** requires an institutional VC round. It is typically 20–40% of the last round, 24–36 months, ~10–14% interest plus warrants. Not available to bootstrappers [vendor 2026].

---

## 5. Bootstrapping realities

- **Funding mix:** personal savings dominate (see 4.3). A solopreneur survey (methodology unclear) says 68% hold under 6 months of savings and 48% have gone a month with no income [vendor]. Pilot: median founder salary fell from $132k (2024) to **$75k (2025)** across 1,844 founders [vendor].
- **Common patterns** (qualitative): keep the W-2 job or go part-time until revenue covers costs; consult or freelance on the side; rely on a partner's income and health insurance; "Coast-FIRE" (retirement savings already on track, so you only need to cover current expenses). No reliable 2026 statistic on the share using each pattern was found.
- **Runway advice:** no authoritative standard. The game uses 12–18 months of personal expenses plus a 3–6 month emergency buffer that is not counted as runway [design].
- **Health insurance (big for US founders):** the **enhanced ACA premium tax credits expired 2025-12-31** and were not extended for 2026. Insurers proposed a **15% median** increase for 2027 (KFF, 2026-08-03), and no extension was found as of October 2026 [editorial: KFF].
  - 2026 national average benchmark silver premium for a 40-year-old: **$625/month** unsubsidized (up ~26%) [editorial: KFF via Becker's].
  - Average enrollee net premium payments rose **58%** ($113 → $178/month) and deductibles rose ~$1,000 [editorial: KFF May 2026 via AJMC].
  - Subsidy cliff returned at **400% FPL = $62,600** for a single person. Above it there is no subsidy; a 60-year-old's benchmark averages $15,914/yr [editorial: KFF].
  - Founders with low first-year income can fall *below* 400% FPL and get subsidies, and Medicaid below 138% FPL in expansion states. The game should compute this.
- **Personally guaranteed debt if the company fails:** the guarantor owes the balance. The lender can sue, get a judgment and report the default, which stays 7 years [editorial: Bankrate, NerdWallet]. Defaulted SBA debt adds Treasury offset and wage garnishment (4.2).
- **Bankruptcy:** Chapter 7 stays on the report **10 years** and Chapter 13 **7 years**, both from filing. The initial drop is about 130–150 points from 680 and 220–240 from 780 [editorial: Experian, FindLaw, MoneyLion 2026-06-08]. Late payments and charge-offs drop off 7 years from first delinquency.

---

## 6. Underwriting logic (implemented in `underwrite()`)

**Step 0: normalize the profile.** Optional fields: `usCitizen` (SBA), `homeValue`, `selfEmployedMonths` (default 24 if self-employed), `has401kLoanAccess`, `householdIncome` (cards), `familyOfferAmount`, `inBankruptcy`.

**Step 1: countable income** (`countableIncome`):
- Cards: stated income. If `incomeType = 'none'`, use household income you can access (CARD Act).
- Installment and secured loans: W-2 income counts in full. Self-employed counts only with ≥24 months on tax returns (HELOC/home equity also accepts ≥12 months, the Fannie Mae-style exception). `none` counts as 0. **So quitting first makes almost every loan unavailable.**

**Step 2: kind-specific rules.**

| Kind | Gate | Price | Max amount |
|---|---|---|---|
| Personal loan | US citizen/PR; FICO ≥ min; income ≥ min; DTI before < maxDti (40–45%) | APR band by FICO, interpolated by DTI/maxDti; fee by band | min(product cap, band cap, income × 0.4–0.6 [design], principal whose payment at longest term keeps DTI ≤ max) |
| Credit card | FICO ≥ 670–680; income > 0; DTI ≤ 50% [design] | standard APR band; 0% for 12–21 months | income × 7–20% by FICO [design]; business cards add business revenue |
| HELOC / home equity / cash-out | equity > 0; FICO ≥ 640; verified income; DTI < 43% (50% at 740+ for HELOC) | prime + margin by FICO (HELOC); fixed bands (loan); PMMS + adj (refi) | min(CLTV(80–85%) × value − mortgage, DTI-limited: HELOC interest-only on the full line, loans amortized) |
| 401(k) loan | current W-2 employer plan | prime + 1 = **8.00%** | min($50k, 50% vested); 60 months |
| ROBS | ≥$50k rollover-eligible [design] | $0 interest; $4,995 + $149/mo | full balance |
| SBA 7(a) Small | 100% US citizen; FICO ≥ 680 [design]; repayment source exists | variable cap for the size (prime + 3 to 6.5) | min($350k; injection limit for start-ups: cash × 0.75 × (1 − inj)/inj with inj = 20% pre-revenue, 15% <24 mo, 10% otherwise [design within 10–30%]; DSCR ≥ 1.10 on business OCF (25% of revenue [design]) + guarantor surplus (income − debts − max($36k, 35% of income)) [design]; 1× annual revenue [design]). Pre-revenue also needs FICO ≥ 700 and home equity ≥ 25% or cash ≥ 50% of the loan, capped at $150k, odds "low" |
| SBA Express | as 7(a) + 24 months with revenue [design] | same caps | min($500k, 15% of revenue [design], DSCR) |
| SBA Micro | citizen; FICO ≥ 600 [design] | 8–13% by FICO | min($50k, half of global cash flow / 1.10 to debt service) |
| Family | offer exists | mid-term AFR 4.61% | the offer |
| Kiva | US resident, no bankruptcy | 0% | $15k |
| Margin / SBLOC | brokerage ≥ $2k / $100k | ~11.9% retail margin; 6.5–9% SBLOC [design] | 50% / 60% of portfolio; warns of the drop that triggers a call |
| RBF / Stripe Capital | MRR ≥ $15k & 12 months / ≥$1k & 3 months | effective APR via IRR | min(ARR/3, 8% × MRR × 48 / 1.5) / 1.25 × MRR [design] |
| Online / bank LOC | FICO ≥ 600/680; 6/12 months; ≥$100k revenue | 20–70% / prime + 1.75 to 7 | 12.5% / 10% of annual revenue [design] |

**Step 3: output** `{ approved, reason, maxAmount, apr, feePct, termMonths, monthlyPaymentAtMax, approvalOdds ('high'|'medium'|'low'|'none'), warnings[], details }`. Approval odds: `high` when FICO is ≥60 above the minimum and post-loan DTI ≤ 75% of the limit; `low` when FICO is within 20 of the minimum or DTI > 90% of the limit [design].

**Sequencing rule the game should teach:** apply for cards, HELOC, personal loan and 401(k) loan **while still W-2 employed**. Quitting removes verifiable income, and a 401(k) loan becomes due when you leave. Apply for the HELOC first (slowest, cheapest), then cards (stated income), and the personal loan last (hard pull, and fixed payments start immediately).

---

## 7. Simulation parameters

| Parameter | Value / range | Source + date |
|---|---|---|
| Prime rate | 7.00% | FRED DPRIME 2026-10-02 [official] |
| Fed funds target | 3.75–4.00% (hiked 2026-09-16) | primerates.com 2026-10-08 [editorial] |
| 30-yr mortgage | 7.28% | Freddie Mac PMMS wk of 2026-10-01 via Trading Economics |
| Avg personal loan APR | 12.28–12.54% | Bankrate 2026-06-10 / 2026-10-07 |
| Personal loan APR by FICO | 800+: 9.67; 740–799: 12.35; 670–739: 19.23; 580–669: 28.42; <580: 29.85 | Credible, closed loans Oct 2025–Sep 2026 |
| Personal loan max | $50k–$100k (most $50–75k) | NerdWallet Oct 2026 |
| Personal loan terms | 24–84 months (LightStream to 240) | NerdWallet Oct 2026 |
| Origination fee | 0% (prime) to 9.99–12% (marketplace) | NerdWallet Oct 2026 |
| Min FICO | 600 (Best Egg, Happen), 660 (LightStream), 680 (U.S. Bank) | NerdWallet 2026 |
| Max DTI (unsecured) | 36–50%; game 40–45% | editorial 2026 [design] |
| Credit union APR cap | 18% to 2027-09-10 | NCUA 2026-02-06 |
| Card APR average | 19.63% | Bankrate 2026-09-30 |
| 0% intro: personal | 21 months, BT fee 3–5% | Credit Karma 2026 |
| 0% intro: business | 12 months on purchases | NerdWallet/Nav 2026 |
| Card limit | 7–20% of income by FICO | [design] |
| Utilization weight | ~30% of FICO ("amounts owed") | FICO via Experian |
| Hard inquiry | <5 points, 12 months scoring, 2 years on report | FICO via editorial |
| HELOC APR | 7.08% avg; prime + 0 to +3 by FICO | MonitorBankRates 2026-10-06; primerates Mar 2026 |
| Home equity loan APR | 6.87–8.08% | MBR 2026-10-06; Bankrate 2026-07-22 |
| Max CLTV | 80–85% (90%+ only top credit) | editorial/wholesale sheet Mar 2026 |
| HELOC DTI | 43–50% | Achieve/Splash 2026 |
| Self-employed docs | 2 years returns (12-month exception for mortgages) | Fannie Mae B3-3.2-01; TMR 2026 |
| 401(k) loan max | min($50k, max($10k, 50% vested)) | IRS FAQ |
| 401(k) loan rate / term | prime + 1–2% / 5 yr | IRS; editorial |
| 401(k) loan on exit | due by tax-return due date incl. extensions; else taxable + 10% | IRS FAQ |
| ROBS cost | $3.5–5k setup + $1.2–1.8k/yr (Guidant $4,995 + $149/mo) | Guidant; IRA Financial comparison |
| ROBS outcome | "most… failed or were on the road to failure" | IRS (updated 2025-11-16) |
| Margin LTV / maintenance | 50% / 25% FINRA (brokers 30%+) | Reg T / FINRA |
| Margin rate ($25k) | IBKR 5.38%; Schwab/Fidelity 11.58%; E*Trade 12.2% | IBKR comparison 2026-09-21 [vendor] |
| AFR Oct 2026 | 4.25 / 4.61 / 5.22% | Rev. Rul. 2026-19 |
| Gift exclusion / lifetime | $19,000 / $15M | IRS FAQ 2026 |
| Kiva US | $1k–$15k, 0%, 12–36 mo, 30–60 days | StartupOwl July 2026 |
| SBA 7(a) max / Express / Micro | $5M / $500k / $50k | sba.gov; PN 5000-876777 |
| SBA variable caps | P+6.5 (≤$50k), +6.0 ($50–250k), +4.5 ($250–350k), +3.0 | sba.gov |
| SBA equity injection (start-up) | 10% minimum; lenders 20–30% | SOP 50 10 8; editorial |
| SBA DSCR (7(a) Small) | ≥ 1.10 | PN 5000-876777 (2026-02-20) |
| SBA collateral threshold | > $50k | SOP 50 10 8 |
| SBA personal guarantee | all 20%+ owners | NerdWallet |
| SBA citizenship | 100% US citizens/nationals (from 2026-03-01; Micro 2026-04-01) | SBA PN 5000-876441 via NAGGL |
| SBA upfront fee (≤$150k) | 2% of guaranteed portion | SBA FY2026/FY2027 notices |
| Microloan rate / term | 8–13% / ≤7 yr | sba.gov |
| Financing approval (SBCS) | 52% fully approved | Fed SBCS 2025 survey (pub. 2026) |
| Firms using personal funds | 54% of firms with challenges | Fed SBCS 2025 survey |
| Online lender requirements | 600–625 FICO, 6–24 months, $100k+ revenue | business.org, OnDeck 2025–2026 |
| Online LOC APR | ~10–80% (OnDeck avg 57.1%) | NerdWallet; Bankrate Feb 2025 |
| Stripe Capital eligibility | ≥3 months, ≥$5k/yr, ≥$1k/mo avg | Stripe docs 2026 |
| RBF floor | $15k MRR / $200k ARR | Lighter (fundraising.md) |
| ACA benchmark (40 yo) | $625/month | KFF 2026 via Becker's |
| ACA subsidy cliff | 400% FPL = $62,600 single | KFF 2026 |
| ACA 2027 proposed increase | 15% median | KFF 2026-08-03 |
| Bankruptcy on report | Ch. 7: 10 yr; Ch. 13: 7 yr | Experian |
| Bankruptcy score hit | −130 to −240 points | FindLaw/MoneyLion 2026 |
| SBA default collection | Treasury offset; AWG up to 15% of pay | law-firm blogs 2025–2026 [vendor] |
| Personal runway target | 12–18 months + 3–6 months buffer | [design] |
| SaaS EBITDA proxy for DSCR | 25% of revenue | [design] |

---

## 8. Non-US founders (short notes)

- **US immigrants:** green-card holders and visa holders **cannot use SBA 7(a)/504/Microloans** after March/April 2026, even with a 1% stake. Many online personal lenders and card issuers do lend to permanent residents, and some lend to certain visa holders. Kiva US needs only US residence.
- **UK:** the government **Start Up Loans** scheme (British Business Bank) is a *personal* unsecured loan of £500–£25,000 per founder (up to £100k per business across co-founders), 1–5 years, at a fixed **7.5% from April 2026** (was 6%). There are no fees, and businesses trading up to 60 months are eligible [official FAQ via startuploans.co.uk]. Director personal guarantees on bank lending are standard.
- **EU (Germany example):** KfW **ERP-Gründerkredit StartGeld (067)** raised its maximum from €125k to **€200k** (effective ~2025-12-01; Merkblatt dated 2026-02-01). KfW takes 80% of the risk, and the rate is set on the commitment date [official: KfW Merkblatt]. Other EU states have similar promotional banks (Bpifrance, ICO). Personal guarantees are common.
- **Canada:** Futurpreneur (ages 18–39) has historically paired its own loan with a BDC loan, reported at up to **$60k combined**, 5 years, with mentoring [unverified single source; check futurpreneur.ca]. The Canada Small Business Financing Program is reported at prime + up to 3% [unverified].
- **India:** **PM Mudra Yojana** loans up to **₹20 lakh** ("Tarun Plus" ₹10–20 lakh for repeat borrowers; PIB 2024-10-25) are guaranteed by CGFMU. Rates of 8–12% are cited by secondary sources. CGTMSE guarantees collateral-free MSME credit [official: PIB].

---

## 9. Obsolete advice (do not use in 2026)

- **"Get a Marcus personal loan."** Goldman stopped new Marcus personal loans in **January 2023**.
- **"LendingClub."** Renamed **Happen Bank** in June 2026, with the same loan products.
- **"Rates are falling in 2026, so wait for cheaper HELOCs."** The Fed **hiked** in September 2026, prime is 7.00%, 30-year mortgages are ~7.3%, and the 10-year Treasury is >5%.
- **"Green-card holders can get SBA loans" / "up to 5% foreign ownership is fine."** Not since 2026-03-01: 100% of owners must be US citizens or nationals.
- **"You need an SBSS score of 155/165 for a small SBA loan."** SBSS was retired 2026-03-01 for 7(a) Small. Lenders now use their own credit analysis and DSCR ≥ 1.10.
- **"SBA loans under $500k don't need collateral"** (SOP 50 10 7.1). Since June 2025 the threshold is **$50k**.
- **"SBA start-ups need no equity injection / 'do what you do.'"** SOP 50 10 8 restored a 10% minimum.
- **"SBA 7(a) fees are waived for small loans"** (FY2024–2025 waivers). FY2026–FY2027: 2% of the guaranteed portion for ≤$150k (0% only for listed sectors ≤$700k in FY2027).
- **"ACA subsidies cap premiums at 8.5% of income for everyone"** (enhanced credits 2021–2025). These expired; the 400% FPL cliff is back.
- **"UK Start Up Loans are 6%."** 7.5% for applications from April 2026.
- **"KfW StartGeld maxes at €125k."** Now €200k.
- **"Credit unions cap at 15%."** The 18% temporary ceiling runs to 2027-09-10.
- **"A 10% credit card APR cap is law."** It was proposed in January 2026 but not enacted per available reporting.
- **"Use your 401(k) loan, then quit."** The balance becomes due by the tax-return deadline, and otherwise it is taxable plus a 10% penalty.

---

## 10. Sources (accessed 2026-10-14; publication date in parentheses where known)

**Official**
- FRED, Bank Prime Loan Rate (DPRIME), value 2026-10-02 — https://fred.stlouisfed.org/series/DPRIME
- IRS, Rev. Rul. 2026-19 (October 2026 AFRs) — https://www.irs.gov/pub/irs-drop/rr-26-19.pdf
- IRS, Frequently asked questions on gift taxes (2026) — https://www.irs.gov/businesses/small-businesses-self-employed/frequently-asked-questions-on-gift-taxes
- IRS, Retirement plans FAQs regarding loans — https://www.irs.gov/retirement-plans/retirement-plans-faqs-regarding-loans
- IRS, Rollovers as Business Start-Ups Compliance Project (updated 2025-11-16) — https://www.irs.gov/retirement-plans/rollovers-as-business-start-ups-compliance-project
- SBA Procedural Notice 5000-876777, Sunset of SBSS Score (published 2026-02-20, effective 2026-03-01) — https://www.naggl.org/wp-content/uploads/2026/05/5000-876777.pdf
- SBA 7(a) loans page — https://www.sba.gov/funding-programs/loans/7a-loans
- SBA Microloans page — https://www.sba.gov/funding-programs/loans/microloans
- SBA Policy Notice 5000-877232 (Microloan citizenship) — https://www.sba.gov/document/policy-notice-5000-877232-update-sop-52-00-b-microloan-program-citizenship-requirements
- GAO B-338157 (2026-07-01) — https://www.gao.gov/products/b-338157
- NCUA, Board extends loan interest rate ceiling (2026-02-06) — https://ncua.gov/newsroom/press-release/2026/ncua-board-extends-loan-interest-rate-ceiling
- Fannie Mae Selling Guide B3-3.2-01 — https://selling-guide.fanniemae.com/sel/b3-3.2-01/underwriting-factors-and-documentation-self-employed-borrower
- Federal Reserve SBCS, 2026 Main Street Metrics (2025 survey) — https://www.fedsmallbusiness.org/-/media/project/clevelandfedtenant/fsbsite/reports/2026/2026-main-street-metrics.pdf
- Stripe Capital eligibility (docs, 2026) — https://docs.stripe.com/capital/eligibility
- LightStream FAQ — https://www.lightstream.com/faq
- Schwab, What is securities-based lending — https://www.schwab.com/learn/story/what-is-securities-based-lending
- KfW Merkblatt ERP-Gründerkredit StartGeld 067 (2026-02-01) — https://www.kfw.de/PDF/Download-Center/F%C3%B6rderprogramme-%28Inlandsf%C3%B6rderung%29/PDF-Dokumente/6000002258_M_067_StartGeld.pdf
- UK Start Up Loans, interest-rate change FAQ (2026-04) — https://test.startuploans.co.uk/support-and-guidance/frequently-asked-questions/changes-to-interest-rate-and-eligibility

**Editorial / data**
- NerdWallet, Best personal loans (Oct 2026) — https://www.nerdwallet.com/m/loans/personal-loans/best-personal-loans
- NerdWallet, Personal loans for business (2026-09-16) — https://www.nerdwallet.com/best/loans/personal-loans/personal-business-loans
- NerdWallet, Happen Bank review (2026-08-10) — https://www.nerdwallet.com/personal-loans/reviews/happen-bank-personal-loans
- Credible, Personal loan rates (week ending 2026-10-11) — https://www.credible.com/personal-loan/personal-loan-interest-rates
- Bankrate, Personal loans (2026-10-07) — https://www.bankrate.com/personal-loans/
- Finder, Personal loan rates (LendingTree Q2 2025 bands) — https://www.finder.com/personal-loan-rates
- MoneyLion, Average personal loan rate forecast (2026-09-18) — https://www.moneylion.com/learn/average-personal-loan-interest-rate-forecast/
- Bankrate via WCAX, Current credit card interest rates (2026-09-30) — https://www.wcax.com/bankrate-article/2026/09/30/current-credit-card-interest-rates/
- LendingTree, Average credit card interest rate (Q1 2026) — https://www.lendingtree.com/credit-cards/study/average-credit-card-interest-rate-in-america/
- Credit Karma, Best balance transfer cards (2026) — https://www.creditkarma.com/credit-cards/i/best-balance-transfer-cards-ccm
- NerdWallet, Best 0% APR business cards (Apr 2026) — https://www.nerdwallet.com/business/credit-cards/best/zero-percent-apr?cat=t3qb91
- Nav, Do business credit cards report to personal credit — https://www.nav.com/business-credit-card/do-business-credit-cards-report-to-personal-credit/
- Bloomberg Government, Trump looks to Congress to cap card rates at 10% (Jan 2026) — https://news.bgov.com/banking-law/trump-looks-to-congress-to-cap-credit-card-rates-at-10-1
- MonitorBankRates, Average home equity rates (2026-10-06) — https://www.monitorbankrates.com/news/home-equity-rates/average-home-equity-rates-october-6-2026
- Primerates, HELOC rates by score (Mar 2026); Fed minutes article (2026-10-08) — https://primerates.com/mortgage-rates/heloc-rates/ ; https://primerates.com/?p=13883
- The Mortgage Reports, HELOC approval for self-employed (2026) — https://themortgagereports.com/126395/heloc-approval-for-self-employed
- Trading Economics, US mortgage rates (Oct 2026) — https://tradingeconomics.com/united-states/30-year-mortgage-rate/news/588887
- United Capital Source, SBA loan interest rates (Apr 2026 update) — https://www.unitedcapitalsource.com/blog/sba-loan-interest-rates-jan-2026/
- NAGGL, FY2026 loan fees — https://www.naggl.org/fy-2026-loan-fees-and-clarification-of-fee-calculation-for-multiple-wcp-or-ewcp-loans/
- Coleman Report, FY2027 fee relief — https://colemanreport.com/sba-hot-topic-tuesday-grocery-manufacturing-and-rural-businesses-get-new-fy-2027-fee-relief/
- selfemployed.com, SBA citizenship rule 2026 (2026-04-16) — https://www.selfemployed.com/news/sba-loan-citizenship-rule-2026/
- NAGGL, Procedural notice revising SOP 50 10 8 citizenship — https://www.naggl.org/procedural-notice-revising-sop-50-10-8-for-new-citizenship-and-residency-requirements/
- NerdWallet, SBA startup loans — https://www.nerdwallet.com/business/loans/learn/sba-startup-loans
- NerdWallet, ROBS (2025-11-24) — https://www.nerdwallet.com/business/loans/learn/rollovers-as-business-startups-robs
- StartupOwl, Kiva review (July 2026) — https://startupowl.com/reviews/kiva
- business.org, Best startup business loans 2026 — https://www.business.org/finance/loans/best-startup-business-loans/
- NerdWallet, Bluevine vs Fundbox — https://www.nerdwallet.com/article/small-business/bluevine-fundbox-small-business
- NerdWallet, Startup business lines of credit 2026 — https://www.nerdwallet.com/article/small-business/startup-business-line-of-credit
- KFF, How much and why ACA premiums are going up in 2027 (2026-08-03) — https://www.kff.org/affordable-care-act/how-much-and-why-aca-marketplace-premiums-are-going-up-in-2027/
- KFF, Loss of enhanced PTCs and older adults (2026) — https://www.kff.org/affordable-care-act/how-will-the-loss-of-enhanced-premium-tax-credits-affect-older-adults/
- AJMC, Marketplace deductibles surge (2026) — https://www.ajmc.com/view/aca-marketplace-enrollment-and-affordability-take-historic-hit-as-enhanced-tax-credits-expire
- Becker's Payer, States ranked by benchmark premiums 2026 — https://www.beckerspayer.com/payer/aca/states-ranked-by-average-aca-benchmark-premiums-in-2026/
- Experian, How long bankruptcy stays on credit report — https://www.experian.com/blogs/ask-experian/how-long-does-a-bankruptcy-stay-on-your-credit-report/
- FindLaw, How bankruptcy affects your credit report — https://www.findlaw.com/bankruptcy/before-you-file/how-bankruptcy-affects-your-credit-report-what-to-know-before-filing.html
- Bankrate, Personal guarantees — https://www.bankrate.com/loans/small-business/personal-guarantees

**Vendor**
- Guidant Financial pricing ($4,995 setup) and 401(k) admin (from $149/mo) — https://www.guidantfinancial.com/pricing ; https://www.guidantfinancial.com/business-services/401k-plan-administration/
- IRA Financial vs Pango ROBS fees — https://www.irafinancial.com/?p=172519
- Interactive Brokers, US margin loan rates comparison (2026-09-21) — https://www.interactivebrokers.com.hk/en/whyib/low-cost-margin.php
- Long Angle, HNW portfolio-backed borrowing (July 2026) — https://www.longangle.com/research/high-net-worth-portfolio-backed-borrowing
- Whiteford, SOP 50 10 8 key changes (2025) — https://www.whitefordlaw.com/news-events/client-alert-sba-issues-sop-50-10-8-key-changes-impacting-sba-7a-lending
- Lenders Cooperative, SOP 50 10 8 collateral — https://lenderscooperative.com/sba-sop-50-10-8-collateral-insurance-requirements/
- Alper Law / Ayar Law, SBA debt collection (2025–2026) — https://www.alperlaw.com/florida-asset-protection/florida-judgment-collection-laws/sba-debt-collection/ ; https://ayarlaw.com/sba-debt-relief/sba-loan-referred-to-treasury
- Lighter Capital — https://lightercapital.com/tech-startup-business-loans
- Arc, Venture debt eligibility — https://www.joinarc.com/learning-center/how-to-qualify-for-venture-debt-criteria-requirements
- Lonely Entrepreneur, Solopreneur statistics 2026 — https://lonelyentrepreneur.com/solopreneur-statistics-2026/
- PIB (India), Mudra limit to ₹20 lakh (2024-10-25), via secondary summaries — https://schemesinindia.in/central/pm-mudra-tarun-plus-20-lakh-loan
