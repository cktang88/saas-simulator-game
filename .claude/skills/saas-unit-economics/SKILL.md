---
name: saas-unit-economics
description: Build a SaaS unit-economics model from the user's real or projected numbers (price, churn, CAC by channel, gross margin, salaries, conversion rates) and compute LTV, LTV:CAC, CAC payback, break-even customers, runway and burn multiple, flagged against benchmarks for B2C, B2B SMB or Enterprise. Use when the user asks about SaaS pricing math, churn, CAC, LTV, payback, runway, burn, break-even, "do my numbers work", or wants a financial model for a subscription business.
---

# SaaS unit economics model

You are building a clear, honest unit-economics model for a real SaaS business. Show every formula, use the user's numbers, label assumptions, compare against benchmarks for their model, and identify the single highest-leverage lever. This is analysis, not financial advice.

## Step 1: Collect inputs

Ask for what is missing in one message. Accept ranges or "I don't know" and fill gaps with clearly labeled assumptions based on the benchmark table below (always say which inputs are assumed).

**Business model**: B2C subscription, B2B SMB (self-serve/inside sales), or B2B Enterprise.

**Revenue**
- Price per plan and plan mix, billing period (monthly/annual, annual discount)
- ARPA: average revenue per account per month (compute from mix if needed)
- Current customers and MRR (if live)
- Expansion: % of MRR added per month from upgrades/seats (default 0 if unknown)

**Retention**
- Monthly logo churn %, monthly revenue churn % (or annual figures; convert)
- Share of churn that is failed payments, if known

**Acquisition (per channel)**
- Spend per month (ads, tools, content, sales salaries allocated)
- Funnel: visitors -> sign-ups -> activated -> paid (conversion rates)
- New customers per month per channel

**Costs**
- COGS per month: hosting, third-party APIs/AI inference, payment fees (e.g. ~2.9% + $0.30 per card charge with a processor, ~5% + fee with a merchant of record; app stores historically 15-30%), support/onboarding staff
- Team: roles, salaries; apply a fully-loaded multiplier (~1.2-1.4x in the US; ask about their country)
- Other opex: tools, rent, legal/accounting
- Cash in bank

## Step 2: Compute (show the formulas)

Use monthly units throughout. Convert annual churn to monthly with `monthly = 1 - (1 - annual)^(1/12)`.

```
ARPA (monthly)            = MRR / customers
Gross margin %            = (Revenue - COGS) / Revenue
Contribution per customer = ARPA x Gross margin %
Lifetime (months)         = 1 / monthly logo churn          (cap at 36-60 months; state the cap)
LTV                       = ARPA x Gross margin % / monthly revenue churn
                            (if NRR > 100%, do not let LTV go infinite: use logo churn and the lifetime cap)
CAC (per channel)         = channel spend (incl. allocated salaries) / new customers from channel
Blended CAC               = total S&M spend / total new customers
LTV:CAC                   = LTV / CAC
CAC payback (months)      = CAC / (ARPA x Gross margin %)
Monthly burn (net)        = total costs - revenue        (cash out minus cash in)
Runway (months)           = cash / net monthly burn
Break-even customers      = fixed monthly opex / contribution per customer
                            (fixed opex = salaries x loaded multiplier + tools + other non-COGS costs)
Net new ARR (period)      = (new + expansion - contraction - churned MRR) x 12
Burn multiple             = net burn in period / net new ARR in period
NRR (12 mo)               = (start MRR + expansion - contraction - churn) / start MRR, for one cohort
Rule of 40 (at scale)     = YoY revenue growth % + profit (or FCF) margin %
Trial/freemium funnel     = visitors x signup% x activation% x paid%  -> customers
```

Also project a simple 12-24 month MRR curve: `MRR_next = MRR x (1 - revenue churn + expansion) + new customers x ARPA`, and show the month cash runs out or the month of break-even. Note that churn on a growing base caps growth: steady-state customers approx = new customers per month / monthly churn.

## Step 3: Benchmark and flag

Compare each metric against the row for the user's model. Mark each Green / Amber / Red with one sentence. These are typical ranges as of the mid-2020s; they vary by segment, price point and stage, so say so.

| Metric | B2C | B2B SMB | B2B Enterprise |
|---|---|---|---|
| Gross margin | ~60-85% (app store fees reduce) | ~70-85% | ~70-85% |
| Monthly logo churn | ~5-10%+ | ~3-7% | <1% (~5-10% annual) |
| Net revenue retention (annual) | ~70-100% | ~90-110% | ~110-130%+ |
| LTV:CAC | >= 3 | >= 3 | >= 3 |
| CAC payback | ideally < 6-12 mo | ~6-18 mo (<12 good) | ~12-24 mo |
| Burn multiple | <1 excellent, 1-1.5 good, 1.5-2 suspect, >2 bad (David Sacks' guide) | same | same |
| Freemium -> paid | ~1-5% | ~2-5% | rare |
| Opt-in trial -> paid | ~5-15% | ~10-25% | pilots instead |
| Card-required trial -> paid | ~30-60% | ~40-60% | — |
| Rule of 40 | applies mostly at ~$10M+ ARR | same | same |

Extra flags:
- LTV:CAC far above 5 with short payback may mean underinvesting in growth.
- LTV based on under ~6 months of churn data is highly uncertain; prefer payback for decisions.
- Founder-led sales "free" CAC is misleading; impute founder time at a market salary.
- AI-heavy products: check inference cost per active user; margins below ~60% need a pricing or architecture fix.
- If failed payments are a large share of churn, flag dunning as a quick win.

## Step 4: Find the highest-leverage lever

Run a quick sensitivity analysis: change each key input by the same realistic amount (e.g. price +20%, churn -20% relative, CAC -20%, trial conversion +20% relative, gross margin +5 points) and show the effect on LTV:CAC, payback, break-even customers and runway in a small table. Recommend the single lever with the biggest impact that is realistically achievable, plus a concrete first action, e.g.:
- Price: raise for new customers, add an annual plan (~15-20% discount), introduce a higher tier.
- Churn: fix activation/onboarding, interview churned users, turn on card updater and smart retries.
- CAC: cut the worst channel, double down on the best by cohort payback, add referral.
- Margin: cache/batch expensive API calls, renegotiate vendors, move to a cheaper payment setup if appropriate.

## Step 5: Output

1. A summary table of inputs (marking assumed values) and computed metrics with benchmark flags.
2. The formulas used, with the user's numbers substituted for the key ones (so they can check the math).
3. The sensitivity table and the recommended lever.
4. Runway / break-even statement in plain words: "At current burn you have X months; you break even at about Y customers."
5. Offer to write the model to the working directory as `unit-economics.csv` (inputs, formulas as text, results, monthly projection rows) and/or `unit-economics.md`. Only write files if the user agrees or explicitly asked. Keep CSV simple: one header row, no merged cells, plain numbers.

## Rules

- Do arithmetic carefully; for anything beyond a few operations, compute with a quick script (e.g. `node -e` or `python3 -c`) rather than in your head, and show results rounded sensibly.
- Never invent the user's data. Label every assumption and make it easy to replace.
- Keep units consistent (monthly vs annual) and state them on every number.
- Tax, accounting and fundraising questions: general information only; recommend an accountant in their jurisdiction.
