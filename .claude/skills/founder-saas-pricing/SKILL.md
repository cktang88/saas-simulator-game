---
name: founder-saas-pricing
description: Design or change pricing for a real SaaS or subscription product in 2026 - pricing model and value metric (seat, flat, usage, hybrid, AI credits, outcome-based/per-resolution), good-better-best tiers, free trial vs freemium vs reverse trial vs card-required, annual discounts, enterprise and sales discounting, localized/PPP pricing, AI-cost-driven repricing, raising prices for existing customers (grandfathering, notice, communication) and price testing (Van Westendorp, Gabor-Granger, conjoint, A/B and cohort tests at low volume). Use when the user asks what to charge, how to structure plans or a pricing page, whether to add credits or usage pricing for AI features, how to price an AI agent, whether to offer a free plan or trial, how much annual discount, how to raise prices without churn, or how to test prices.
---

# Founder SaaS pricing (2026)

You are helping a founder set or change prices for a real product. Pricing is the fastest lever on revenue, and in 2026 AI inference costs make it a margin question too. Benchmarks with sources and dates are in `docs/research/channels-partnerships-pricing.md` (§3) and `PRICING_RESEARCH` in `public/data/channels.js`. Quote ranges and label vendor or anecdotal evidence; never invent statistics.

## Step 1: Gather inputs (one message, only what is missing)

1. Product, buyer (B2C, B2B SMB self-serve, mid-market, enterprise), and who signs.
2. Current plans and prices, plan mix, ARPA, free→paid rate, monthly churn, NRR if known.
3. Cost to serve per customer per month, especially AI/LLM cost: median and heaviest 10% of users.
4. What customers get out of it, in units they would recognize (seats, contacts, documents, tickets resolved, hours saved, revenue gained).
5. Competitor prices and models (pull from their pricing pages).
6. Volume: new paid customers per month (determines what testing is possible).
7. Goal: first price, new tier, AI add-on, raise prices, fix margin, or move to usage/credits.

## Step 2: Choose the model and value metric

Use the 2025 mix as context: hybrid ~41% and rising, flat ~22% and falling, per-seat ~15% and falling, outcome-based ~5% primary (25% expect it by 2028) — Growth Unhinged survey of 240 companies, 2025-06.

Pick with this logic:
- **Flat** if a single persona, low and even cost to serve, micro-SaaS. Add a usage cap if any AI feature exists.
- **Per seat** only if value really scales with people collaborating. Warn that AI agents shrink seat counts.
- **Usage** for APIs, infrastructure and developer tools where the buyer already budgets per unit.
- **Hybrid (default for 2026 SaaS with AI):** platform fee per tier + included usage or credits + overage or top-ups.
- **Outcome / per-resolution** only when the outcome is unambiguous, attributable and measured in-product (e.g. Intercom Fin $0.99 per resolution with a monthly minimum). Define what counts in writing.

Value metric test: it grows with customer value, the customer can predict it, it is easy to meter, and for AI it tracks your marginal cost. Reject metrics that punish adoption.

## Step 3: AI features and credits

1. Compute cost per action (tokens × model price) and per user per month for median and p90 users. Use `founder-product-specs` if needed.
2. Target gross margin ≥ 70–80% for SaaS overall; an AI add-on may run lower if it drives retention, but make that explicit.
3. Pick a structure: included credits per tier (monday.com-style 500/mo), paid top-ups, rollover cap (Clay rolls over up to 2x), or per-action price (Agentforce $0.10/action; Copilot $0.04 per extra premium request).
4. Name credits in the customer's units ("~200 reports") rather than abstract tokens.
5. Never move existing users from unlimited to metered without notice, a calculator and a grace period. Cursor's 2025-06 switch to usage limits caused backlash, an apology and refunds within three weeks.

## Step 4: Tiers and pricing page

- 3 self-serve tiers + "Enterprise / contact us" is the default; 2 for very simple products, 4 only if segments differ clearly.
- Each tier answers "who is this for"; gate on value (limits, advanced features, SSO/audit/admin for enterprise), not on basics.
- Make the middle tier the intended choice; target 50–70% of buyers there (practitioner rule of thumb, not a benchmark). Anchor with a higher tier.
- Publish prices if ACV < ~$5k or the motion is PLG; above that, show "from $X" or a contact form.
- Annual plan: 15–20% discount, most common 16.7% (two months free); smaller % at higher price points. Default the toggle to annual only if monthly churn is high and cash matters.
- B2C apps: offer annual + monthly (weekly only for impulse categories, expect high churn and refunds); see `founder-paid-ads` and `docs/research/marketing-and-ads.md` for paywall data.

## Step 5: Trial, freemium or reverse trial

Benchmarks (ChartMogul × Kyle Poyar, 200 B2B products, 2026-01): median free→paid 8% and bimodal; card-required trials ~25–35%; no-card trial, freemium and reverse trial ~3–15%; 62% use 14-day trials; the trial vs freemium gap largely disappears once signup volume is counted.
- **Card-required trial:** sales-assisted or high-intent traffic; fewer signups, higher conversion.
- **No-card trial (7–14 days):** default for B2B self-serve with fast time to value.
- **Freemium:** only if free users create virality or SEO/network value and cost almost nothing to serve. Cap AI usage on free plans.
- **Reverse trial:** full features for 14 days, then drop to free; good when premium features are the aha moment.
Pick one and say what number would make you switch.

## Step 6: Price increases

1. Check signals: win rate high, almost no price objections, competitors 1.5×+ higher, NRR flat. SaaS renewal prices rose ~8–14%/yr in 2025–2026 (Vertice/Zylo), so modest increases are normal.
2. Raise for new customers first; watch conversion for 4–8 weeks.
3. For existing customers: 30–90 days' notice; grandfather 6–12 months or offer an annual lock-in at the old price; tie the increase to added value; never surprise-bill.
4. Expect some extra churn. Evidence is anecdotal (e.g. $49 → $79 with grandfathering: ~3% churn, +47% net revenue, practitioner report). Model: extra churn ≈ k × increase%, k ≈ 0.05–0.15 for SMB monthly, lower for annual enterprise, higher for B2C [estimate]. Show the break-even churn: an increase of p% pays off if fewer than p/(1+p) of affected revenue churns.
5. Draft the customer email: what changes, when, why, what they keep, how to lock in, who to contact.

## Step 7: Test prices at the volume they actually have

- Fewer than ~100 paid conversions/month: do not run split A/B price tests; they will not reach significance for months. Use sequential cohort tests (change new-signup price for 4–8 weeks, compare conversion, ARPA and early churn) plus 10–20 willingness-to-pay conversations with real buyers.
- Surveys: Van Westendorp (~200–400 qualified respondents) for an acceptable range, Gabor-Granger for demand at specific points, conjoint (~300–600) for packaging. Pitfalls: stated vs revealed willingness to pay, respondents without budget, pooled segments, order effects.
- Sales-led: vary the quoted price across opportunities and track win rate and discount requested.

## Step 8: Discounting and localization

- Negotiated discounts: buyer data shows ~10% average (Vendr, falling since 2022) up to ~34% off list (Vertice); suggested ranges by ACV: self-serve 0–5%, SMB 5–15%, mid-market 10–25%, enterprise 15–35% [estimate]. Trade discounts for term length, prepayment, case studies or volume, never for nothing. Multi-year 10–25%.
- PPP/localized pricing: show local currency; consider 40–70% of US price in low-PPP markets via a merchant of record or a PPP tool. Published uplift figures are vendor claims; measure your own conversion and watch VPN abuse.

## Output format

1. Recommended model and value metric, with the reason and the rejected alternatives.
2. Tier table: name, who it is for, price monthly/annual, limits/credits, key features.
3. Margin check per tier including AI cost (median and p90 user).
4. Trial/free decision and the switch criteria.
5. For changes: rollout timeline, grandfathering, the customer email, expected churn range and break-even.
6. Test plan sized to their volume, with a decision date.

## Do not

- Do not copy a competitor's price without checking cost to serve and value metric.
- Do not recommend unlimited AI usage on flat or free plans.
- Do not present per-tier conversion "lifts" or grandfathering churn reductions as established facts; most public numbers are vendor or anecdotal.
- Do not run price A/B tests that existing customers can compare without a plan to honor the lower price.
