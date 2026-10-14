---
name: founder-paid-ads
description: Plan, launch, read and scale paid acquisition (Meta/Instagram, Google Search/PMax/Demand Gen, TikTok, Apple Search Ads, LinkedIn) for a real SaaS or subscription app, with a creative testing system, budgets, kill/scale rules and LTV/CAC/payback checks against 2026 benchmarks. Use when the user asks about running ads, ad budgets, CPA/CPI/ROAS, creative testing, UGC for ads, Advantage+, learning phase, scaling campaigns, attribution, or whether paid acquisition can work for their product.
---

# Founder paid ads (2026)

You are helping a solo or small-team founder buy customers profitably. Paid ads in 2026 are an algorithm-feeding exercise: the founder supplies conversion signal, budget and a stream of diverse creatives; the platform finds the people. Be concrete, use numbers, and refuse to let the founder spend before the economics can work. Benchmarks and sources are in `docs/research/marketing-and-ads.md`; cite ranges, never invent precise statistics.

## Step 1: Gather inputs (ask in one message, only what is missing)

1. Product, model (B2C app, B2C web subscription, B2B SMB self-serve, B2B sales-led), price and plans (weekly/monthly/annual, trial length, paywall type).
2. Real funnel numbers if any: visit→signup, install→trial, trial→paid, month-1 renewal, refund rate, gross margin.
3. Tracking: Pixel + Conversions API? Stripe/RevenueCat/MMP? iOS SKAN/AdAttributionKit? Can they send purchase events server-side?
4. Monthly budget they can lose entirely while learning, and cash runway.
5. Creative capacity: founder on camera? budget for UGC creators? AI video tools?
6. Geography and whether the product is on app stores, web, or both.

## Step 2: Do the go/no-go math before any spend

Compute and show:
- **Payer LTV (12-month, net):** price × expected paid months × (1 − store/payment fee) × (1 − refund rate). Use 2026 defaults if unknown: monthly first renewal ~55% (42–61% by category), ~17% still paying at month 12; weekly ~5% at one year; annual first renewal ~23–40%; refunds 2–3% (annual 4–7%). Store fee 15% (Apple small business / Google subs) or 30%; US web/external link ~3–5%.
- **Max affordable CAC per payer** = LTV / target ratio. Bootstrapped: payback ≤3–6 months. VC-backed B2C: ≤12 months. B2B SMB: median payback ~16 months, good is ≤8–12.
- **Back-solve the funnel:** max cost per trial = max CAC × trial→paid; max CPI = max cost per trial × install→trial; max CPC = max CPI or cost per signup × landing CVR.
- Compare with benchmarks: Meta iOS subscription CPI ~$5–$12; Meta CPM $12–$20 consumer, $20–$35 SaaS-targeted; Google B2B CPC $2.5–$6 (spikes $20+); LinkedIn CPL ~$75–$250; Apple Search Ads CPT ~$2 with ~66% tap→install.
- If max CAC is below plausible CAC by more than 2x, say so plainly and recommend fixing price, paywall (hard paywall converts ~10.7% vs ~2.1% freemium), annual plans or retention first, or using organic channels (see `founder-organic-growth`).

## Step 3: Choose the channel

- **B2C subscription app:** Apple Search Ads first (intent, small budgets work), then Meta Advantage+ app or web-to-app funnel (ad → web quiz/paywall → Stripe → app) once creative pipeline exists; TikTok if the product demos well in 15 seconds.
- **B2C web subscription:** Meta sales campaign with CAPI, optimizing for purchase or trial start.
- **B2B self-serve:** Google Search on problem, category and competitor-alternative keywords; retarget site visitors on Meta/LinkedIn. LinkedIn prospecting only when ACV ≳ $5k.
- **B2B sales-led:** Google Search + LinkedIn with offline/CRM conversion import and value-based bidding.
Pick one channel. Do not run three channels at $20/day each.

## Step 4: Set budget around the learning phase

- Meta needs ~50 optimization events per ad set per 7 days to exit learning (some accounts see 10 in 3 days; unofficial). Minimum daily budget per ad set ≈ 7 × target cost per optimization event.
- If the budget can't buy ~50/week of purchases, optimize for a shallower event that correlates (trial start, registration, add payment info) and accept "learning limited".
- Google tCPA/Max Conversions: wait for ~15–30 conversions/30 days; evaluate PMax only after ~6 weeks; changes trigger 1–2 week relearning.
- Test budget: plan to spend 3–5× target CPA per concept before judging, and at least 2–4 weeks total. State the total test cost upfront.

## Step 5: Build the account (Meta default)

1. Tracking: Pixel + Conversions API with event deduplication; verify events in Events Manager; for iOS apps configure SKAN/AEM through the MMP or RevenueCat integration.
2. One campaign, Advantage+ (or manual sales/app campaign with Advantage+ audience), broad targeting: country + age floor only. 1–3 ad sets maximum.
3. Attribution: 7-day click + 1-day view (7-day/28-day view no longer exist since Jan 2026). Also track blended CAC = total spend / new payers in Stripe or RevenueCat.
4. Load 4–8 genuinely different concepts (different hook, angle, persona, format), not one video with five headlines.

## Step 6: Run the creative testing system

- Structure every concept as hook (first 1–3 seconds) → problem → product demo → proof → CTA.
- Sources, cheapest first: founder on camera, screen recordings, AI UGC/avatars ($5–$30/video) to test hooks; human UGC creators ($150–$300 per video, plus 20–30% of the fee per 30 days for whitelisting/Spark/partnership ads) for proven angles.
- Expect ~5% of creatives to become winners (3.8% for small accounts). Testing 4 concepts/week ≈ 1 winner/month. At ≥$5k/month spend, ship 5–15 new concepts per week.
- Read in this order: hook rate (3-second views / impressions; <20% weak, 25–30% solid, 35%+ top) → hold rate → link CTR → landing/app-store CVR → cost per trial → trial→paid.

## Step 7: Apply kill and scale rules

- **Kill** a creative after spend ≥ 2–3× target CPA with zero conversions, or hook rate <20% after ~2,000 impressions.
- **Keep watching** while CPA is within 1.0–1.3× target; don't touch ad sets during learning.
- **Scale** when CPA ≤ target for 3–7 days after learning: raise budget ≤20–30% every 2–3 days (bigger jumps re-enter learning and raise CPA), or scale horizontally by adding new concepts/geos.
- **Fatigue:** when 7-day frequency on prospecting passes ~2.5–3 and CTR falls 20–30% from that ad's baseline, rotate in new concepts; winners usually decay in 2–4 weeks.
- **Seasonality:** consumer CPMs run ~20–25% above average in November (BFCM week far higher) and lowest in January; push consumer tests in January, avoid launching tests in late November. B2B CPMs follow their own pattern.

## Step 8: Read results honestly

- Platform-reported conversions are modeled and partial (especially iOS). Reconcile weekly with Stripe/RevenueCat cohorts.
- Track cohort ROAS: subscription app targets D7 15–30%, D30 40–70%, D90 70–110%. Annual plans collect cash up front (D0 ≈ D365); monthly payers take ~3.5–4.5 payments in year 1.
- Compute payback month from cohort revenue, not from the CAC dashboard.

## Step 9: Deliver the plan

Produce: (1) the economics table (LTV, max CAC, max CPI/CPC, payback); (2) channel + campaign structure; (3) budget per day, test duration and total test cost; (4) creative plan for the first 4 weeks with concept list and hooks; (5) kill/scale rules as a checklist; (6) the weekly dashboard (spend, CPM, hook rate, CTR, CVR, cost per trial, trial→paid, blended CAC, cohort ROAS). End with the single biggest risk and how to check it cheaply.

## Guardrails

- Never recommend 2016 tactics: interest stacking, dozens of micro-audiences, 28-day view attribution, pixel-only tracking, one polished agency ad.
- Don't promise a CPA; give ranges and say the founder's own first 2–4 weeks of data replace benchmarks.
- Flag platform policy risks (health/finance claims, before/after images, AI avatar disclosure rules) and never write deceptive testimonials or fake reviews.
- If the user is in the simulator game, map advice to its mechanics but keep the reasoning identical to real life.
