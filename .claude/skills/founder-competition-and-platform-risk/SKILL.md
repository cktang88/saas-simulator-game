---
name: founder-competition-and-platform-risk
description: Help a real SaaS founder assess and respond to competitors, AI-lab "sherlocking", LLM price changes and model deprecations, platform risk (Google core updates and AI Overviews, Meta ad account bans, App Store review and link-out rules, marketplace policy changes), operational and security shocks (outages, surprise cloud or AI bills, card-testing attacks, leaked keys, breaches) and macro budget freezes. Use when the user asks "a competitor just raised/launched/cut prices, what do I do", "will OpenAI/Anthropic/Google kill my startup", "is my product a wrapper", "my traffic dropped after a Google update", "my Meta ad account got banned", "our model is being deprecated", "we got a huge cloud bill", "Stripe shows hundreds of declined payments", or wants a risk register for their startup.
---

# Competition, platform and operating risk (2026)

You are advising a real founder. Separate what is measured from what is estimated. For most of these risks no published
base rate exists, so give ranges and say they are estimates. Full data and dated examples are in
`docs/research/world-ops-support-life.md` §1 and §3 and in `public/data/world.js` (`WORLD_EVENTS`, `OPS`).

## Step 1: Map exposure before giving advice

Ask for: business model, stage, acquisition channels with their shares (SEO, Meta, Google Ads, app stores,
marketplaces, outbound), how much of the value is model output vs proprietary data, workflow depth and integrations,
LLM providers and models used, checkout type (self-serve card vs invoice), and current spend caps and monitoring.

Build a risk register with rows: risk, exposure (high/medium/low with the reason), an estimated likelihood per year, the
impact if it happens, and the cheapest mitigation. Rank by exposure × impact. Do not rank by how scary the headline is.

## Step 2: Competitors

- A rival's launch, raise or price cut rarely kills a company. Weak positioning does. In niches with several venture-
  backed rivals, expect roughly 1 funding announcement and several pricing or packaging moves a year (estimate; large-
  SaaS trackers logged ~0.7 pricing/packaging changes per company in 2025).
- **New entrant:** sign up, do a teardown, and write an honest comparison page. Change the roadmap only on customer evidence.
- **Funded rival:** expect pricier shared ad keywords and more outbound to your prospects for a few months. Indie
  founders should niche down to a segment the rival ignores, compete on service and keep prices stable. Venture-backed
  founders should use it as category validation in the investor narrative.
- **Price cut or free tier:** do not match by reflex. Check whether the lost deals are your ICP. A limited free plan
  only makes sense if activation is strong and support load is affordable.
- **Rival exit:** publish a migration guide and an importer quickly. Displaced customers search within weeks.

## Step 3: AI-lab overlap ("sherlocking")

Dated precedents to cite (verify before quoting further detail):
- ChatGPT's 2022–23 launch hit Jasper (internal valuation cut ~20%, layoffs July 2023).
- ChatGPT Record mode and connectors (2025-06-04) overlapped meeting-notes and enterprise-search tools.
- AgentKit/Agent Builder (2025-10-06) raised pressure on agent builders (speculative; no documented losses).
- ChatGPT Atlas browser (2025-10-21).
- Claude Cowork (2026-01-12) and its plugins (early Feb 2026) set off a software selloff (S&P software & services
  roughly −8% in days).

Score wrapper risk 1–5 on: (a) the value is mostly a general model capability, (b) the task is horizontal (notes,
writing, summarizing, chat-with-docs, browsing), (c) no proprietary data or feedback loop, (d) shallow integrations, (e)
no compliance, distribution or trust moat. A score of 4–5 needs a repositioning plan now: go vertical, own the data or
workflow, integrate with the lab's own app surfaces (MCP or apps), or sell the layer above the model.

Remind the founder that labs also *lower* their costs. Fixed-capability inference prices fell 9–900× a year across
benchmarks (Epoch AI, 2025), and o3 dropped 80% on 2025-06-10.

## Step 4: Model lifecycle and providers

- Expect 1–2 forced migrations a year for AI-heavy products. Notice periods range from about two weeks (preview models)
  to many months (stable models). Read the provider's deprecation page and plan from its date.
- Require: an eval set of 30–200 real cases, a model-routing layer or at least a second provider, per-key spend limits,
  and alerts on error rate and cost.
- Free tiers are not production infrastructure. Google cut Gemini API free limits in December 2025 with little notice.

## Step 5: Platform risk

- **Google:** ~3 confirmed core updates a year, each rolling out over ~2 weeks. Wait for the rollout to finish before
  changing anything. Then prune thin pages and add first-hand evidence. AI Overviews cut clicks on informational queries
  heavily (see `marketing-and-ads.md`), so invest in being cited: reviews, comparisons, original data.
- **Meta ads:** restrictions are often automated and appeals partly automated (NYT, 2025). There is no published base
  rate. Verify the business, use two admins with two-factor auth, and never let an unpaced AI agent bulk-edit ads through
  the API. Do not open a second account to get around a ban, because linked assets can be banned permanently.
- **App stores:** Apple rejected ~23–25% of submissions in 2024–2025 and Google ~8–10%. Build review buffer into launch
  dates. US apps may link out to web checkout without Apple commission since the 2025-04-30 *Epic v. Apple* order. Apple
  appealed, so flag that the rule could change.
- **Marketplaces:** a single marketplace channel is a concentration risk (Atlassian ended Server apps in Feb 2024). Keep a
  direct channel and own customer emails.

## Step 6: Operating and security shocks

- **Outages:** a solo founder on managed cloud should expect several user-visible incidents a year (estimate 6–12). Set up
  uptime monitoring with phone paging, a status page and a rollback path. DORA elite teams recover in under an hour.
- **Surprise bills:** set hard caps or budgets with alerts on every metered service and LLM key. Ask the provider for a
  goodwill credit after fixing the cause. It is often granted, but never guaranteed.
- **Card testing:** at the 2022 peak Stripe blocked 20M+ attempts a day. Protect self-serve checkout before launch with
  CAPTCHA, rate limits, Radar rules and login before checkout. During an attack, lock down first, then ask Stripe about
  fees.
- **Leaked keys:** GitGuardian found 23.8M secrets leaked on public GitHub in 2024, and 70% of secrets leaked in 2022 were
  still valid. Turn on secret scanning and rotate any exposed key immediately.
- **Breach:** contain, preserve logs and call a lawyer. GDPR requires notifying the regulator within 72 hours where there is
  risk. US state deadlines vary (often 30–60 days), and B2B contracts may require 24–72 hours. This is general
  information, not legal advice.

## Step 7: Macro

As of 2026-10-14 the Fed target is 3.50–3.75% (held through June 2026). Buyers scrutinize renewals and AI pilots. For
enterprise and SMB-heavy businesses, prepare ROI evidence per account before renewals and offer annual prepay. Do not
cut price across the board.

## Output format

1. A risk register table (top 8 risks) with exposure, estimated likelihood, impact and mitigation (hours and cost).
2. For any live event, a 48-hour response plan and a 30-day plan.
3. A wrapper-risk score with the reasoning for each criterion.
4. A list of the estimates you used and what the founder should monitor to replace them with their own data.
