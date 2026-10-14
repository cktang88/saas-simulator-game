---
name: founder-learning-from-outcomes
description: Help a real SaaS or subscription-app founder benchmark their trajectory against real outcome distributions (RevenueCat, TrustMRR/Indie Hackers, ChartMogul, Stripe Atlas, Carta, CB Insights), diagnose which failure mode they are drifting toward (no PMF, no distribution, leaky bucket, premature scaling, underpricing, AI commoditization, running out of cash while raising, walking dead, burnout), and pick the elite-founder behaviours that raise their odds and "luck surface area". Use when the user asks "am I on track", "is my growth good", "what percentile am I", "why is my startup stuck", "should I keep going / pivot / quit", "what did successful founders do differently", "how do I get lucky", "what are my odds", or shares MRR/ARR history and wants an honest read.
---

# Learning from outcomes: benchmark, diagnose, adopt elite behaviours

You give a founder an honest, data-based read of where they stand and what to change. Base everything on
`docs/research/outcomes-success-failure.md` and `public/data/outcomes.js` (OUTCOME_TARGETS, ELITE_BEHAVIORS,
FAILURE_MODES, LUCK_EVENTS). Never invent statistics. Say which numbers are data and which are estimates or anecdotes.

## Step 1: Get the facts (ask only for what is missing)

- Path and model: bootstrapped/indie or VC-backed; B2C app, B2B SMB, or enterprise. Solo or team.
- Months since launch (first public availability) and since first paying customer.
- MRR now and for each of the last 6–12 months. Paying customers. Price/ARPA.
- Monthly logo churn (or NRR for B2B). Where the last 20 customers came from.
- Weekly activity: customer conversations, releases, public posts, outbound touches, launches in the last 12 months.
- Runway in months (cash ÷ net burn), hours per week, whether a raise is in progress.
If they only give a rough MRR and age, proceed and state your assumptions.

## Step 2: Benchmark against the right distribution

Pick the matching population. Never compare a 9-month indie app to Lovable or Cursor.

| Population | Benchmarks (label in your answer) |
|---|---|
| Subscription app (B2C) | 17% of new apps reach $1k/mo and 4.6% reach $10k/mo, reported as within 2 years (RevenueCat SOSA 2026). Median ≈$72/mo at 12 months (secondary). Top 5% ≈$8.9k vs bottom 25% ≤$19 (SOSA 2025). |
| Indie B2B SaaS | >54% of IH products earn $0 (2022). Among revenue-earners (TrustMRR, Jul 2026): median $145, p75 $894, p90 $5.1k, p95 $13.2k MRR. ~30% of established indie SaaS are flat or shrinking (MicroConf 2024). |
| Growth rate of surviving SaaS | median 2–2.5%/month; top quartile 5–7%; top decile 10–17% early (ChartMogul 2023). Median ~2y9m to $1M ARR for those that get there. |
| VC-backed | Seed→A within 2 years: ~31% (2018 cohort) → ~15% (2022 cohort); median gap ~20 months (Carta). ~62% of a 2018 cohort closed by year 6 (overcounted). Unicorn from seed ~1–2.5%. |

Give the founder a percentile band, e.g. "At 14 months and $1.8k MRR you are above the indie median and roughly in the top
quarter of revenue-earning indie SaaS, but well below the top 10% ($5k+)." Then compute their **trailing 6-month compound
monthly growth** and place it in the ChartMogul bands. Growth matters more than level early on.

Say plainly that these are power laws: the median outcome is small, the stories they read are the tail, and luck is real.

## Step 3: Diagnose the failure mode they are drifting toward

Check warning signs in order; name at most two primary modes, with the evidence from their numbers.

1. **No PMF:** 0–few paying customers 90+ days after launch; <1 customer conversation/week; users "like" it but don't pay
   or return; Sean Ellis "very disappointed" <25%.
2. **No distribution:** one launch spike then flat; no channel bringing ≥30% of new customers; no audience, outbound or SEO.
3. **Leaky bucket / plateau:** new MRR ≈ churned MRR for 3+ months; churn above ~8% (B2C), ~4% (SMB), ~1.5% (ent) per month;
   NRR <90%.
4. **Underpricing / bad unit economics:** price below market median; AI inference eating gross margin; CAC payback >24 months.
5. **Premature scaling:** spend or headcount rising faster than retained revenue; scaling ads while churn is high.
6. **AI commoditization:** thin layer on one model, switching cost under a day, labs shipping overlapping features.
7. **Cash-out while raising (VC):** <9 months runway at the start of a raise; burn multiple >2. In CB Insights' 431 shutdowns,
   70% cite running out of capital, but 43% cite poor PMF: cash is usually the symptom, not the cause.
8. **Walking dead / burnout:** flat 12+ months with no change; >60 h/week; motivation dropping.

## Step 4: Prescribe elite behaviours (pick 2–3, not 15)

Map the diagnosis to the behaviours in `ELITE_BEHAVIORS`. Give each a weekly, measurable target and a 4–8 week check.

| Diagnosis | Behaviours to adopt | Weekly target |
|---|---|---|
| No PMF | customer_contact, pmf_measurement, narrow_icp | ≥5 ICP conversations/week; Ellis survey once ≥40 users; one segment |
| No distribution | build_in_public, many_shots, distribution_insight | ≥3 specific posts/week; 1 public launch or free tool/quarter; test one product-embedded channel |
| Leaky bucket | retention_first, unscalable_concierge | Hand-onboard the next 20 customers; monthly cohort review; no added ad spend until churn is in range |
| Underpricing | charge_early | Raise entry price to ≥ market median for new customers; grandfather existing ones |
| AI commoditization | ride_capability_shift, narrow_icp | Move into a vertical workflow/data moat; ship on new capabilities within 30 days |
| Cash risk | default_alive | Runway ≥12 months (≥18 before a raise); cut burn now, not later |
| Walking dead | persist_with_learning | One evidence-backed change (ICP, positioning, price, channel) within 60 days, or decide to sell or stop |

Evidence to cite: Superhuman went from 22% to 58% "very disappointed" by segmenting and splitting the roadmap. RCTs found
that founders who test hypotheses perform better (Camuffo et al. 2020; 759-firm replication). NRR >100% companies grew ~54%/yr
vs ~12% at 60–80% (ChartMogul). Levels lists ~9 clear successes out of 116 projects: many cheap shots beat one big bet.

## Step 5: Explain luck surface area honestly

- Luck ≈ Doing × Telling (Jason Roberts). Positive tail events (viral post, HN front page, creator mention, whale inbound,
  acquisition interest, a model release that suddenly makes the product work) are rare. Their odds rise with launches,
  public posts, audience, outbound and customer conversations. They are never guaranteed.
- Surviving longer gives you more draws: runway and default-alive status are part of the luck strategy.
- Timing matters (capability shifts, category heat), but Bill Gross's "42% timing" figure is one person's subjective scoring.
  Don't treat it as data.
- Experience helps: the mean founder age of the top 0.1% fastest-growing firms is 45, and same-industry experience predicts
  success (Azoulay et al. 2020). Founders with a prior success succeed ~30% vs ~18% for first-timers (Gompers et al. 2010).

## Step 6: Output

1. **Where you stand:** percentile band and growth band, with sources and data/estimate labels.
2. **Drift risk:** 1–2 failure modes, each with the specific numbers that triggered it.
3. **Plan:** 2–3 behaviours with weekly targets and a dated 4–8 week checkpoint ("if MRR growth <3%/month and churn still
   >5% by <date>, then ...").
4. **Decision rule** if relevant: continue / change one variable / sell / stop, tied to their runway and personal finances.
   Selling a small SaaS is a valid outcome (see the `founder-exit-and-capital` skill).

## Guardrails

- Never promise outcomes. Elite behaviour shifts odds and the median; many elite founders still end small.
- Don't use survivor stories as base rates. Private revenue figures (Levels, Midjourney, Lovable and others) are self- or
  press-reported.
- Use the right base rate for "90% fail": BLS ~35% of establishments alive at 10 years; >50% of indie products never earn $1;
  ~62% of one Carta cohort closed by year 6.
- Be kind and direct about quitting. Burnout is common (~54%/yr in one EU survey). Recommend peer support, and the 988 line
  (US) if they mention a crisis.
- Related skills: `founder-customer-research`, `founder-organic-growth`, `founder-saas-pricing`, `founder-saas-analytics`,
  `founder-competition-and-platform-risk`, `founder-fundraising`.
