# Outcomes: distributions, elite founders, failure modes, luck and timing (research, October 2026)

Scope: what the real outcome distribution looks like for indie and venture-backed SaaS and subscription apps; what elite
founders did differently (25+ cases); how companies actually fail; how much is skill, timing and luck; and how to turn this
into game mechanics that produce a wide, realistic spread of outcomes. Data file: `public/data/outcomes.js`.
Founder-facing skill: `.claude/skills/founder-learning-from-outcomes/SKILL.md`.

Compiled 2026-10-14. In-game year starts Nov 2026.

**Labels.** [P] primary data (the publisher's own dataset or paper). [S] secondary report of someone else's data.
[V] vendor data (self-selected customers, marketing interest). [A] anecdote or founder self-report (unaudited).
[Q] qualitative or practitioner opinion. **[design]** game estimate bounded by the cited data; never show it to players as a
statistic. Private-company revenue figures are almost all self-reported or press-reported; treat them as [A] unless filed.

**Related docs (not repeated here):** competitor, AI-lab, platform, outage, security and life events are in
`docs/research/world-ops-support-life.md` and `public/data/world.js` (`WORLD_EVENTS`). Fundraising bars and micro-SaaS exit
multiples are in `docs/research/fundraising.md`. Launch-platform and K-factor numbers are in `docs/research/marketing-and-ads.md`.
This doc only adds outcome distributions, success/failure patterns and the *positive* tail and a few missing negative events.

---

## 1. Outcome distributions (data)

### 1.1 Headline: it is a power law at every level

- **Subscription apps (RevenueCat SOSA 2026, 115k+ apps, >$16B revenue, published 2026-03-19) [V/P]:** 17% of new apps
  reached **$1k/month** recurring revenue (19% the year before) and **4.6%** reached **$10k/month** (5.3% the year before).
  Secondary coverage gives the window as **within two years of launch** (9to5Mac 2026-03-04; Sherwood 2025-03-19 on the 2025
  report). Gaming had the highest $10k share (8.9%), Photo & Video the highest $1k share (21.4%); Education, Productivity,
  Travel, Shopping and Business were hardest. Top quartile grew MRR ≥80% YoY, top 10% +306%, bottom quartile shrank >33%.
- **2025 report detail [S]:** top 5% of new apps earned >400x the bottom 25% (≈$8,888 vs ≤$19 in their first period);
  median days to $1k MRR **for apps that got there** ≈60 (TechRepublic/Gigazine; "median" vs "average" used inconsistently).
- **Median subscription app one year after launch: ≈$72/month** (secondary coverage of SOSA 2026; not visible on the
  RevenueCat summary page; treat as [S]).
- **Annual plans:** ≈72% of annual subscribers cancelled in year 1 in the 2026 report (≈56% the year before); 35% of annual
  cancellations happen in month 1. AI apps: median year-1 realized LTV $30.16 vs $21.37 non-AI, but AI monthly plans retain
  36% worse over 12 months [V/P].

### 1.2 Indie / bootstrapped SaaS

| Measure | Value | Source |
|---|---|---|
| Revenue-reporting indie startups (TrustMRR, Stripe-verified, Jul 2026) | n=3,787 of 8,699 tracked (~44%) report revenue. Of those: p25 **$29**, median **$145**, p75 **$894**, p90 **$5,107**, p95 **$13,205** MRR; mean $4,298; 44% under $100 MRR | BigIdeasDB "State of Indie SaaS Revenue 2026" [V; vendor publishes conflicting medians elsewhere ($7, $2,100) — use the documented $145] |
| Indie Hackers Stripe-verified products (2022) | >54% at **$0**; ≈5% above ~$100k/yr (≈$8.3k MRR) | IH community analysis of 937–970 products [S; publicity bias, $0 may include abandoned] |
| Gumroad products (adjacent) | 89.2% of 147,591 products had zero sales | DEV analysis [S] |
| MicroConf State of Independent SaaS 2021 | >50% of respondents under $10k MRR | MicroConf [P survey; respondents are established, so biased upward] |
| MicroConf 2024 (n≈469–700) | ~30% grow 1–4% MoM, ~30% flat or shrinking; $1,000+/mo entry plans added ≈$1,073 new MRR/month vs ≈$316 for $1–9 plans; enterprise-targeting ≈27% MoM vs single digits for SMB/consumer | MicroConf via podcast/pages [S] |
| Stripe Atlas 2025 cohort (23k companies, all paths) | **20%** charge a first customer within 30 days of incorporation (8% in 2020); median 34 days to first payment among those monetizing within 3 months; median time to $100k revenue 108 days (for those that got there); only 2.2% raised within 3 months | Stripe blog 2025-12-18 [P] |
| ChartMogul 2023 (2,200+ SaaS, all funding) | Median **2y 9m to $1M ARR**, best-in-class ~9 months (from first paying customer); median >5 yrs to $10M, best 2y 9m; **only 13% reach $10M ARR even after 10 years** | ChartMogul SaaS Growth Report 2023-08-30 [V/P; survivorship: only firms already on ChartMogul] |
| ChartMogul 2023 monthly growth | median 2–2.5%/mo throughout; top quartile 5–7% early, 3–5% later; top decile 10–17% early, 6–7% after $3M ARR | same |
| ChartMogul 2023 retention vs growth | NRR 60–80% → ~12% annual growth; NRR >100% → ~54% | same |
| ChartMogul × Dealroom 2024 (2,500+ SaaS) | Median bootstrapped and VC reach $300k ARR at about the same time; top-quartile bootstrapped reach $1M ARR in ~2 yrs, VC ~4 months faster; median VC <3 yrs from $300k→$1M, bootstrapped >3 yrs | ChartMogul 2024-06-12 [V/P] |
| Solo founders | ~50.7% of independent SaaS founders run solo (MicroConf) [S]; 30–36% of new Carta startups solo-founded in 2024–2025, but they took only ~15–17% of priced-round cash (Carta Solo Founders Report 2025; Founder Ownership Report 2025/2026) [P via S] |
| Solo vs team survival (Kickstarter-funded ventures 2009–2015) | Solo for-profit founders ≈2.5x as likely to survive, more revenue; reversed for nonprofits | Greenberg & Mollick, "Sole Survivors" (NYU Stern summary) [P; consumer/creative sample] |

**Reading it:** of everyone who *starts* an indie SaaS, roughly half never charge anyone; of those who charge, the median
business is a hobby-sized $100–$200 MRR; ~10% of revenue-earners pass ~$5k MRR; ~5% pass ~$10–13k MRR; reaching $100k
MRR ($1.2M ARR) as an indie is a top ~0.2–0.5% outcome **[design, bounded by TrustMRR p95 and ChartMogul]**. The
founders you hear about are the tail.

### 1.3 Venture-backed

| Measure | Value | Source |
|---|---|---|
| Carta 2018 founding cohort (4,369 US companies, status 2025-01-01) | 56.4% raised seed; **36.4% reached Series A**; 14.8% B; 4.4% C; 1.1% D+. Outcomes: 0.34% IPO, 5.5% acquired, **1.3% private unicorn**, 32.2% alive, **61.9% "closed"** (overcounted: no priced round = closed) | Carta data posts 2025-02-11/19 [P via S; Carta users self-selected] |
| Seed→Series A within 2 years | 30.6% (Q1 2018 seed cohort) → 15.4% (Q1 2022); ~10–11% of the 2025 seed cohort within one year (vs 4–5% for 2022–23) | Carta via PMF Show summaries [S] |
| Median seed→A gap | 616 days (~20 months), Q2 2025 | Carta via Causo [S] |
| PitchBook seed outcomes (to 2025-09-30) | ~53% of consensus seed deals later raised an A vs ~28% non-consensus; 29.5% vs 39.4% went out of business; roughly ⅓ failed, ⅓ returned less than invested, ⅓ positive | PitchBook via Causo [S] |
| Unicorn rate from seed | 0.8% (bottom seed-valuation quartile) to 5.6% (top), 2016–2020 cohorts (Carta 2025); ~2.5% (AngelList 2013–2019, 2,622 seed investments); 1.2% (Dealroom cohort) | [S] |
| Shutdowns | Carta: 769 (2023) → 966 (2024) US Carta customers dissolved/bankrupt (+25.6%); AngelList 233 → 364 (+56%) | TechCrunch 2025-01-26 [S] |
| SimpleClosure 2025 | Series A share of shutdowns ~6% → ~14%; seed shutdowns avg 3–5 yrs old, Series A ~7 yrs; median AI shutdown raised ~$2.4M (all: $2.8M); AI ~16% of shutdowns, mostly wrappers/app-layer | SimpleClosure 2025-12-03 [V] |
| CB Insights 431 VC-backed shutdowns since 2023 | median last raise → shutdown **22 months**; >half died within 2 years of last raise; nearly ¼ "walking dead" >3 years | CB Insights 2026-03-05 [P] |
| AI-era speed (Stripe) | Top 100 AI companies on Stripe hit $1M annualized revenue in a median **11.5 months** (≈4 months faster than fastest SaaS); AI startups at $30M+ got there in just over 18 months vs ~5.5 yrs for top 2018 SaaS | Stripe "Indexing the AI economy" / 2024 annual letter (Feb 2025) [P] |
| Bessemer State of AI 2025 (20 companies) | "Supernovas" ≈$40M ARR year 1, ≈$125M year 2, ~25% gross margin; "Shooting stars" ≈$3M year 1 → ≈$103M year 4, ~60% GM (Q2T3) | Bessemer 2025-08-13 via mirrors [S] |

### 1.4 All small businesses (baseline)

- BLS Business Employment Dynamics: **34.7%** of establishments born in 2013 still operating in 2023 [P, BLS TED 2024].
  Secondary readings of BED: ~78% survive year 1; ~51% of the March 2020 cohort alive in March 2025; ~49% 5-year average
  since 1994 [S, startbusinessbystate.com]. Closing ≠ failing (sales, retirements, moves end records too).
- Shikhar Ghosh (HBS, 2011): 30–40% of VC-backed firms liquidate; 70–80% miss projected returns; 90–95% miss declared
  projections [S]. "90% of startups fail" depends entirely on definition — never use it as a single parameter.

---

## 2. Elite founder stories (what they did, what luck did, how long)

Revenue is self-reported or press-reported unless noted. "Years to breakout" = from start of the project to the first
clearly self-sustaining traction.

| # | Company (founder) | Path / model | What they did | Luck / timing | Time & trajectory | Sources |
|---|---|---|---|---|---|---|
| 1 | Nomad List, Remote OK, Photo AI (Pieter Levels) | indie, B2C/SMB | Ships fast, charges from day one, builds in public; his projects page lists **116 projects: 9 "success", 11 "okay", 19 failed, 71 n/a, 6 new** — "incredibly high failure rate" | Rode remote-work and AI-image waves; audience compounding | 12 startups in 12 months (2014) → Nomad List; portfolio reported ~$3–5M/yr (secondary, varies) | levels.io/projects (upd. 2026-10-03) [A]; IH profiles [S] |
| 2 | ShipFast, DataFast (Marc Lou) | indie, SMB/dev | ~16–21 products in ~2–3 years before/around ShipFast; boilerplate from his own repeated code; launched on X/PH/HN to an existing audience | Audience built over 2 years of public launches | ShipFast $6k in 48h (Aug 2023); DataFast took 124 days to $1k MRR | Starter Story, IH [A] |
| 3 | TypingMind (Tony Dinh) | indie, B2C→B2B | Shipped a better ChatGPT UI within weeks of the API; public building; moved to team/B2B plans | ChatGPT API timing (Mar 2023) | ~$33k/mo early; secondary 2026 teardown: $130–160k/mo by late 2025, >50% B2B recurring | IH; newsletter teardown [A/S] |
| 4 | Headlime, HeadshotPro (Danny Postma) | indie, B2C | Ships on new model capabilities fast; heavy SEO | GPT-3 (2020), image fine-tuning (2022) | Headlime sold within ~8 months (reported $1M); HeadshotPro grew to a small team | IH, Failory [A] |
| 5 | Plausible (Uhlu Kolu, Marko Saric) | indie, SMB | Open source, privacy positioning vs Google Analytics, content on HN/GitHub, never paid for ads | GDPR/cookie backlash | $400 → $10k MRR in 9 months; $500k → $1M ARR; ~$3.1M ARR late 2024 | Plausible blog [P/A]; Tiny Empires [S] |
| 6 | Tally (Marie Martens, Filip Minev) | indie, SMB/B2C | After a failed travel startup; generous free tier, PLG, tiny team | Notion-style UX timing | $2M ARR Feb 2025 → $3M Jun 2025 → $4M Oct 2025 → $5M (2026), team 8–11 | blog.tally.so [A] |
| 7 | Kit / ConvertKit (Nathan Barry) | indie, SMB | Two years stuck ≈$1–2k MRR and shrinking; went all-in; **direct sales** to bloggers, repositioned for creators, concierge migrations | Creator economy wave | ~$2k → ~$100k MRR by 2016; ~$33M ARR 2022 | secondary write-ups [A/S] |
| 8 | 37signals / Basecamp | indie, SMB | Consulting firm → own tool (2004); calm, profitable, opinionated; content and books as distribution | Web 2.0 SMB wave | Revenue undisclosed (estimates $23M–$280M conflict); minority Bezos stake 2006 | [Q] — do not use revenue |
| 9 | Ahrefs (Dmytro Gerasymenko) | bootstrapped, SMB | Product-led content marketing, data moat (own crawler), no sales team | Long SEO boom | ~$7M (2015) → >$100M (Latka interview 2024); ~$149M 2024 (Latka estimate) | Latka [S] |
| 10 | Mailchimp (Chestnut, Kurzius) | bootstrapped, SMB | Side project of an agency (2001); went all-in 2007; freemium 2009; never raised | SMB email + freemium timing | Intuit acquisition ~$12B announced 2021-09, closed 2021-11-01 | Wikipedia/Intuit [S] |
| 11 | Zapier (Wade Foster et al.) | YC, SMB | Side project; only ~$1.3M seed; integrations as distribution (~25k SEO landing pages, partner co-marketing) | API-economy wave | Profitable since ~2014 | YC blog, Latka 2019 [S] |
| 12 | Calendly (Tope Awotona) | mostly bootstrapped, SMB→ent | Self-funded (savings, debt), $550k seed 2014; every invite exposes the product to the recipient (built-in loop) | Remote work 2020 | ~$100k ARR in 4 months of monetizing (2014); $350M Series B at $3B (Jan 2021) | Latka, TechCrunch 2021-04 [S] |
| 13 | Canva (Melanie Perkins) | VC, B2C/SMB | Earlier yearbook business (Fusion Books) proved the idea; rejected by **100+ investors**; persisted ~3 years to raise | Social-media visual content wave | Launched 2013; >$3B revenue, profitable 8 years (Lenny 2025) | Lenny's Newsletter [S] |
| 14 | Figma (Field, Wallace) | VC, SMB→ent | ~4 years building browser-based multiplayer design before public launch (2016); paid tier 2017 | WebGL/browser capability; remote collaboration | ~$0.7M (2017) → $75M (2020, Sacra est.); Adobe $20B deal killed 2023-12-18 with $1B reverse termination fee; IPO 2025-07-31 | Sacra, Verdict [S] |
| 15 | Slack (Butterfield) | VC, SMB→ent | Game *Glitch* failed (2011–12); internal chat tool became the product; pivot with remaining cash | Second time (Flickr also came from a failed game) | Launched 2013–14; 2015 survey: 51% "very disappointed" | TechCrunch 2019-05-30 [S] |
| 16 | Notion (Ivan Zhao, Simon Last) | VC, B2C→SMB | 2015 near-death: crashing app, angel money running out; let the team of 4 go, moved to Kyoto to cut costs, rewrote from scratch | Template/creator community wave 2018–20 | Relaunch 2016; later ~$10B valuation | Figma blog (quotes Zhao) [S] |
| 17 | Superhuman (Rahul Vohra) | VC, B2C/prosumer | PMF engine: Sean Ellis survey, segment to "very disappointed" personas, 50/50 roadmap (double down on what lovers love / fix what holds others back), $30/mo, concierge onboarding | — | **22% → 33% (segmenting) → 58%** "very disappointed" over ~3 quarters (2017–18) | Superhuman blog / First Round 2018-11 [P/A] |
| 18 | Linear (Saarinen et al.) | VC (light), SMB | Craft and speed for one ICP (software teams); invite-only waitlist; profitable since ~year 2 | Post-Jira fatigue | >$100M ARR (2026), tender at $2.5B (2026) | Dealroom, pulse2 [S] |
| 19 | Cursor (Anysphere) | VC, SMB/dev | Forked VS Code; shipped very fast on frontier models | Claude 3.5 Sonnet class models (mid-2024) | ~$100M ARR Jan 2025; $500M ~Jun 2025; $1B Nov 2025 | Wikipedia, press [S] |
| 20 | Lovable | VC, B2C/SMB | Open-source GPT Engineer audience → product; shipped in public | Same model wave | $17M ARR in 3 months; $100M ~Jul 2025 (~8 months); $200M Nov 2025; $400M Feb 2026 | TechCrunch via aggregators [S] |
| 21 | Bolt.new (StackBlitz, Eric Simons) | VC, B2C/SMB | 7 years building WebContainers; company near shutdown; launched Bolt on X | Claude 3.5 Sonnet made in-browser codegen good enough | $0 → $20M ARR in ~2 months, ~$40M in ~5 months (Oct 2024–Mar 2025) | Lenny's Newsletter 2025 [A] |
| 22 | Base44 (Maor Shlomo) | bootstrapped solo → acquired | Side project, solo, built in public on LinkedIn/X | Vibe-coding wave | ~6 months; Wix acquisition **$80M + earnout** (Jun 2025); later reported ~$100M ARR inside Wix | Globes, Calcalist [S] |
| 23 | Midjourney (David Holz) | self-funded, B2C | Discord as distribution and community; no VC | Diffusion-model timing (2022) | ~$200M (2023, Sacra est.) to ~$500M (2025, Latka est.) | [S, estimates conflict] |
| 24 | Cal AI (Yadegari, Langmack) | VC-light, B2C app | Influencer/TikTok distribution engine; hard paywall | Vision models making photo calorie counting viable | Founder claims: 5M downloads in 8 months; >$30M annual revenue in <2 yrs; acquired by MyFitnessPal (2025-12 or 2026-03, sources differ) | TechCrunch, MyFitnessPal [A/S] |
| 25 | Gumroad (Sahil Lavingia) — instructive "partial" | VC → indie | Raised on a billion-dollar plan; growth fell short; laid off 75%; became a profitable small company | — | "Reflecting on my failure..." (2019-02) | sahillavingia.com [A] |
| 26 | Stripe / Airbnb (do things that don't scale) | VC | "Collison installation": set up users on the spot; Airbnb founders photographed listings themselves | — | — | Paul Graham, "Do Things That Don't Scale" (2013-07) [Q] |

### 2.1 Recurring behaviours (and what the evidence actually supports)

1. **Many shots on goal, cheaply.** Levels: ~9 clear successes out of ~116 listed projects; Marc Lou: ~1 breakout in ~20.
   Per-project hit rates of ~5–10% for skilled, audience-backed indie makers [A]. A breakout is a lottery with many tickets, not
   a plan. *Mechanic:* each public launch is an independent draw; skill raises the odds per draw, audience raises the payoff.
2. **Customer contact and PMF measurement.** Superhuman moved 22% → 58% by segmenting and acting on survey data [A/P].
   RCT evidence: founders taught a "scientific approach" (hypotheses, tests) performed better (Camuffo et al., Management
   Science 2020, 116 startups; replication with 759 firms in 4 RCTs, CEPR DP15972) [P]. Pivot effects conflict between the
   two papers. *Mechanic:* conversations and structured tests reduce uncertainty about fit faster.
3. **Distribution insight, not just product.** Zapier (integration pages), Calendly (loop in every invite), Cal AI
   (influencers), Plausible (HN/open source), Canva/Ahrefs (product-led content). *Mechanic:* channel–product fit is a hidden
   variable; finding it is discrete and multiplicative.
4. **Charging early and pricing up.** Levels and Superhuman charged from day 1. MicroConf 2024: $1,000+ entry plans add ~3x
   more new MRR per month than $1–9 plans [S, correlational].
5. **Narrow ICP.** Superhuman (founders/execs who value speed), ConvertKit (professional bloggers/creators), Linear (software
   teams). *Mechanic:* narrower ICP → higher conversion and word of mouth, smaller ceiling until expansion.
6. **Riding a capability shift fast.** Bolt, Lovable, Cursor, TypingMind, Postma, Base44, Midjourney, Cal AI all shipped within
   weeks to months of a model or API becoming good enough. Stripe: AI companies hit $1M ~4 months faster than SaaS [P].
7. **Survive long enough for luck to arrive.** Notion (Kyoto), Slack (pivot), Bolt (7 years), ConvertKit (2-year plateau),
   Canva (100+ rejections), Figma (4 years pre-launch). Frugality buys draws. Counter-evidence: CB Insights' "walking dead"
   (¼ of dead companies lingered >3 years) — persistence without learning is a failure mode.
8. **Retention before acquisition.** ChartMogul: NRR >100% companies grew ~54%/yr vs ~12% at 60–80% NRR [V/P].
9. **Domain experience and age.** Azoulay, Jones, Kim & Miranda (AER: Insights 2020): mean founder age of the 1-in-1,000
   fastest-growing new ventures is **45.0**; "prior experience in the specific industry predicts much greater rates of
   entrepreneurial success" [P].
10. **Build in public / audience ("telling").** Levels, Marc Lou, Dinh, Barry, Shlomo. Jason Roberts' "Luck Surface Area"
    (codusoperandi.com, ~2010-11): **L = D × T** (doing × telling) [Q].

---

## 3. Failure stories and failure modes

### 3.1 Base rates of stated reasons

| Source | Sample | Reasons (overlap; sums >100%) |
|---|---|---|
| **CB Insights, 2026-03-05** | 431 VC-backed shutdowns since 2023; reasons for 385 | **Ran out of capital 70%** (usually the final symptom), **poor PMF 43%**, **bad timing/macro 29%**, **unsustainable unit economics 19%** (five further reasons in chart only) |
| CB Insights (older, 101 post-mortems, ~2014; 2019 update n=111) | VC-backed | No market need ~42%, ran out of cash ~29%, not the right team ~23%, outcompeted ~19%, pricing/cost ~18% [S — superseded] |
| Startup Genome 2011 (3,200 startups) | high-growth tech | "Premature scaling" in ~70%; 1–2 pivots associated with 3.6x user growth [P; definition is circular — use as direction only] |
| Failory (via Colorlib) | ~120 cemetery cases | lack of funds 38%, no market need 35% [S, small sample] |
| SimpleClosure 2025 | hundreds of structured shutdowns | AI wrappers/app-layer: margins compressed by model cost shifts, low switching costs, eroded differentiation [V/Q] |

No credible survey gives indie/micro-SaaS failure reasons. Indie post-mortems on Indie Hackers/Reddit repeatedly cite: no
distribution ("built it, nobody came"), not charging/underpricing, motivation loss, a side project never getting enough
hours, and churn exceeding new MRR [A]. Use those as **[design]** shares (see `FAILURE_MODES.baseRate`).

### 3.2 Failure cases

| Company | Year | What happened | Failure mode(s) | Warning signs visible earlier | Source |
|---|---|---|---|---|---|
| Builder.ai | 2025 | Raised >$500M; audited revenue restated 2024 $220M → ~$55M, 2023 $180M → ~$45M; lender seized cash; insolvency | integrity/metric inflation; cash | revenue not reconciling to cash; reliance on partner "deals" | Sifted, Silicon Canals 2025 [S] |
| Humane (AI Pin) | 2024–25 | $699 device; returns reportedly exceeded sales by mid-2024; sought $750M–$1B sale, sold parts to HP for **$116M**; device bricked 2025-02-28 | built before validating; hardware cost; timing | poor reviews at launch; returns | Fortune, The Decoder 2025-02 [S] |
| Jasper | 2023–24 | ChatGPT (Nov 2022) replaced $50/mo prosumer subs; 2023 forecast cut ≥30%, internal valuation −20%, layoffs; pivot to enterprise marketing | AI commoditization / sherlocked | horizontal thin layer; SMB churn spike | Maginative, Sacra [S] |
| Gumroad | 2015 | Growth below VC plan; laid off 75% | wrong capital path / premature scaling | hiring ahead of revenue | Lavingia 2019 [A] |
| Glitch (→ Slack) | 2012 | Game failed to reach ~200k players needed; Flash dependency | no market need; platform dependency | low retention | TechCrunch 2019 [S] |
| Notion (near death) | 2015 | Unstable tech stack, cash running out, team of 4 let go | technical debt + runway | crashes, burn | Figma blog [S] |
| StackBlitz (near death) | 2024 | Weeks from shutdown before Bolt (≈$80k ARR claim unverified) | slow monetization of deep tech | flat ARR for years | Lenny 2025 [A] |
| ConvertKit (near death) | 2013–14 | ~2 years at $1–2k MRR, shrinking | no distribution; diffuse ICP | flat MRR, churn ≥ new | secondary [A] |
| Typical AI wrapper | 2023–26 | Price of underlying model falls, labs ship the feature, users switch | commoditization; margin | <30 days switching cost, no data/workflow moat | SimpleClosure 2025 [V]; world-ops doc §1.3 |
| Typical 2021-vintage seed company | 2024–26 | Raised at high valuation, missed A bar, bridged, closed 3–5 years in | ran out of capital while fundraising | <12 months runway, growth <2x | Carta/SimpleClosure [S] |

### 3.3 How failure unfolds (timeline the game should mimic)

1. **Months 0–6: building without users.** Few or no conversations, no pre-sales, launch date slips. Warning: 0 paying
   customers after 90 days of "launched".
2. **Months 3–12: launch then silence.** One spike (PH/HN), then flat. Activation low, no repeatable channel. (See IH: >54% $0.)
3. **Months 6–24: the plateau / leaky bucket.** MRR flat: new ≈ churned. MicroConf 2024: ~30% of indie SaaS are flat or
   shrinking. Churn > 5–8%/mo for SMB; NRR < 90%.
4. **VC path: the bridge.** Missed A bar; median 22 months from last raise to death; >half die within 2 years of last raise;
   ¼ linger >3 years (CB Insights 2026).
5. **Final step:** cash (70% cite it), founder exhaustion, or co-founder exit. Solo indies usually *quit* rather than go bankrupt.

---

## 4. Luck, skill and timing

### 4.1 Evidence

- **Skill persists, but modestly.** Gompers, Kovner, Lerner & Scharfstein (JFE 2010; 1986–2003 VC-backed): success (IPO or
  filed) **30%** for founders with a prior success vs **18%** first-time vs **20%** prior failure (HBS Working Knowledge reports
  34/22/23 for another cut) [P]. The authors attribute part of it to skill and part to a self-reinforcing reputation effect
  (suppliers and customers commit more to a "proven" founder). So: prior success ~1.5–1.7x; prior failure ~1.1x.
- **Age and industry experience:** mean age 45.0 for top 0.1% growth; industry experience strongly predictive (Azoulay et al.
  2020) [P].
- **Timing (weak evidence):** Bill Gross (TED 2015) scored ~200 companies (100 Idealab + 100 others, sources vary) on five
  factors; timing "accounted for 42%" of the difference, team/execution 32%, idea 28%, business model 24%, funding 14% [Q].
  **Weakness:** one person's subjective scoring, small sample, no published method, likely hindsight bias. Use it to justify
  *having* a timing variable, not its size. Better timing evidence: the 2024–25 AI cohort (Stripe, Bessemer) shows how a
  capability shift moves the whole distribution; ChartMogul shows <$1M ARR growth fell >half from the 2021 peak — the macro
  window moves medians by 2x.
- **Structured method helps:** Camuffo et al. RCTs (2020; 2024 replication, 759 firms) [P].
- **Shots on goal:** Levels (~8% success per listed project), Marc Lou (~1 in ~20) [A]. RevenueCat top-10% vs bottom-25%
  spread of 400x shows per-product variance is enormous even for similar effort [V].
- **Luck surface area:** L = D × T (Roberts) [Q]. In games, implement as: event odds scale with *doing* (launches, features
  shipped, conversations) × *telling* (posts, audience, outbound).

### 4.2 Positive tail events (rates are [design] unless stated)

| Event | Realistic frequency | What raises odds | Magnitude anchor |
|---|---|---|---|
| Post goes viral (X/LinkedIn/TikTok/Reddit) | 0.3–1.5 per 100 public posts for an account with a few thousand followers [design] | posting volume, specificity, audience, B2C | 10–100x normal reach for 1–3 days; signups 2–10x for a week |
| HN front page | Show HN ≈15% of HN stories; front-page share small (Amplify <2% of front page) [S]; per Show HN 5–15% [design] | dev audience, genuine novelty, timing | anecdotes: 678–35,000 visits; 14–125 signups; 1–2 days [A] |
| Product Hunt top 3 | <5% base rate per launch (marketing doc) | audience, prep | 1 day spike, low paid conversion |
| Creator / newsletter mention (unpaid) | 0.1–0.5/yr indie B2C [design] | product quality, outreach to creators, audience | 1–2 weeks of 3–20x signups |
| Press feature | journalists answer ~3% of pitches (channels doc) | pitches, news hook, funding/launch | days |
| Whale customer inbound | 0.05–0.3/yr SMB/ent with content/SEO presence [design] | outbound volume, SEO, case studies, enterprise features | 5–50x median ACV; customer-concentration risk >30% |
| Acquisition interest (inbound) | indie: 0.1–0.5/yr above ~$5k MRR [design]; strategic (Base44-type) ≪1% | visibility, growth rate, strategic overlap | micro-SaaS 2–4x revenue / 4–6x SDE (fundraising doc); strategic 10x+ rare |
| Platform/model tailwind | 1–3 relevant capability jumps/yr for AI products (Sonnet 3.5 2024-06 → Bolt/Lovable/Cursor) [S + design] | aiDependence, shipping speed, prototypes ready | category-wide demand 2–10x for 3–12 months; only for fast movers |
| Investor inbound (VC path) | rises with public traction; [design] | growth posts, demo days, ARR milestones | see fundraising doc |
| Category heat (timing) | per-niche latent variable | — | demand multiplier 0.5–2x over years |

### 4.3 Negative tail events not already in `world.js`

Whale customer churn; payment processor reserve/freeze (finance doc mentions; not an event yet); clone after a viral moment
(indie common [A]); lead investor withdraws term sheet; acquisition falls through (Adobe–Figma 2023 — Figma got a $1B fee,
rare); key contractor/employee leaves; launch flop despite effort. Existing events to reuse instead of duplicating:
`competitor_*`, `ai_lab_feature_overlap`, `llm_*`, `google_core_update`, `meta_ad_account_restricted`, `founder_illness`,
`burnout_episode`, `negative_public_review`, `data_breach`, `surprise_bill`.

---

## 5. Implications for the game

1. **Calibrate with bots against `OUTCOME_TARGETS`.** Run 1,000 seeded bot founders per path×model with an "average" policy:
   median, p90, p99 MRR at 12/24/36 months must land in the ranges. Run an "elite" policy (all `ELITE_BEHAVIORS`) and a
   "classic mistakes" policy: elite should shift the median 3–10x and the p90 ~3–5x, but **≥30–50% of elite runs must still
   end below $10k MRR at 24 months** (indie) — outsized, not guaranteed. Mistake policy should fail ≥80% of the time.
2. **Model outcomes multiplicatively, not additively** (log-normal by design): MRR ≈ market size × channel fit × product fit ×
   price × retention × timing × luck. Multiplying many factors naturally yields a power law.
3. **Hidden latent variables, revealed by actions:** true ICP pain, channel–product fit, category heat. Conversations,
   experiments, launches and public posts reveal or *re-draw* them. Founders who never test never find them.
4. **Luck as Poisson draws scaled by surface area:** rate = base × Π(1 + w·log(1+activity)) with diminishing returns;
   magnitudes heavy-tailed (Pareto α≈1.5–2.5 [design]). Cap per-event magnitude so no single event guarantees success.
5. **Time is the scarce resource.** Every behaviour costs hours; elite behaviours trade build time for contact/telling time.
   The trade-off must bite (shipping slows if you talk all day).
6. **Survival = more draws.** Runway, frugality and default-alive status extend the number of lottery tickets; show "months of
   runway" and "draws remaining" explicitly.
7. **Failure is mostly slow.** Use warning signs (flat MRR, churn ≥ new, 0 paying after 90 days, <6 months runway while
   raising) and give the player chances to react. Hard deaths (fraud, breach, platform ban) are rare.
8. **Timing:** a per-niche heat curve plus scheduled model-capability jumps; fast movers capture most of the tailwind.
9. **Never show [design] numbers as statistics.** UI copy may cite labelled data (RevenueCat 17% / 4.6%, CB Insights 70/43/29/19).

---

## 6. Simulation parameters

| Parameter | Value / range | Source + date |
|---|---|---|
| B2C app reaches $1k MRR within 24 months | 0.17–0.19 | RevenueCat SOSA 2025/2026 via Sherwood/9to5Mac [V/S] |
| B2C app reaches $10k MRR within 24 months | 0.046–0.053 | same |
| B2C app reaches $100k MRR within 36 months | 0.003–0.008 | [design] bounded by RevenueCat top-5% ≈$8.9k |
| B2C app median monthly revenue at 12 months | $50–$100 (reported $72) | SOSA 2026 secondary [S] |
| Indie SaaS share with any revenue at 12 months | 0.40–0.60 | IH >54% $0 (2022) [S]; TrustMRR 44% reporting [V]; [design] |
| Indie SaaS revenue-earner MRR percentiles | p50 $145, p75 $894, p90 $5.1k, p95 $13.2k | TrustMRR 2026-07 [V] |
| Indie SaaS reach $10k MRR by 24 months | 0.03–0.06 of starters | [design] bounded by TrustMRR/IH |
| Indie SaaS reach $100k MRR by 36 months | 0.002–0.005 | [design] bounded by ChartMogul 2023 |
| Median time to $1M ARR (if reached) | ~2y9m; top ~9 months from first customer | ChartMogul 2023-08 [V/P] |
| Monthly growth of surviving SaaS | median 2–2.5%; top quartile 5–7%; top decile 10–17% early | ChartMogul 2023 [V/P] |
| Indie flat or shrinking | ~30% | MicroConf 2024 [S] |
| First customer ≤30 days of incorporation | 20% (2025) | Stripe Atlas 2025-12-18 [P] |
| Seed → Series A within 24 months | 0.15–0.30 (cohort-dependent) | Carta 2018–2022 cohorts [S] |
| Reach Series A ever (from founding, Carta) | ~0.36 | Carta 2018 cohort [S] |
| Unicorn from seed | 0.01–0.025 (0.8%–5.6% by valuation quartile) | Carta 2025; AngelList 2021 [S] |
| VC-backed closed within ~6 years | 0.50–0.62 | Carta 2018 cohort (overcounted) [S]; PitchBook ⅓ failed [S] |
| Last raise → shutdown | median 22 months | CB Insights 2026-03-05 [P] |
| Shutdown reason shares (VC) | cash 0.70, PMF 0.43, timing 0.29, unit econ 0.19 | CB Insights 2026 [P] |
| AI top-100 time to $1M annualized | median 11.5 months | Stripe [P] |
| Prior-success founder multiplier | ×1.5–1.7 on success odds; prior failure ×1.0–1.1 | Gompers et al. 2010 [P] |
| Founder age/industry experience | experienced 40–50 y/o in own industry: ×1.5–2 on tail odds | Azoulay et al. 2020 [P]; magnitude [design] |
| Per-launch breakout odds, skilled indie | 0.05–0.10 | Levels/Marc Lou [A]; [design] |
| PMF "very disappointed" threshold | ≥40% | Sean Ellis via Superhuman [Q] |
| NRR → growth | NRR 60–80%: ~12%/yr; >100%: ~54%/yr | ChartMogul 2023 [V/P] |
| Elite policy median uplift | ×3–10 median MRR at 24 months; ≥30–50% still < $10k MRR | [design] |
| Viral post probability | 0.3–1.5% per post (scaled by audience) | [design] |
| Whale inbound | 0.05–0.3/yr | [design] |
| Inbound acquisition interest | 0.1–0.5/yr above $5k MRR | [design] |
| Model-capability tailwind | 1–3/yr; ×2–10 category demand for 3–12 months for fast movers | [S] examples + [design] |

---

## 7. Obsolete advice (2016–2022 → 2026)

| Old advice | 2026 reality |
|---|---|
| "90% of startups fail" as a fact | Depends on definition: BLS ~35% of establishments alive at 10 yrs; ~62% of 2018 Carta companies closed by year 6; >50% of indie products never earn $1. Use the right base rate for the path. |
| "Get to $1M ARR and the A follows" | Seed→A in 2 yrs fell from ~31% (2018) to ~15% (2022 cohort); median gap ~20 months. |
| "Build it and they'll come / launch on PH and you're made" | >54% of IH products at $0; PH top 3 <5% and a one-day spike. Distribution is the bottleneck. |
| "Raise as much as you can" | AI tools let solo founders reach revenue faster (Atlas: 20% first customer in 30 days); 30–36% of new startups are solo; median dead company had raised $11M (CB Insights). |
| "Thin AI layer on GPT is a business" | Jasper 2023; SimpleClosure: wrappers dominate AI shutdowns. Moat must be workflow, data or distribution. |
| "Young founders win" | Mean age of top 0.1% growth founders is 45 (Azoulay et al. 2020). |
| "Timing explains 42% of success" | Anecdotal (Gross 2015). Timing matters, but treat as one multiplicative factor. |
| T2D3 for top growth | AI-era top growth is Q2T3 (Bessemer 2025) for a handful; medians grow 2–2.5%/month. |

---

## 8. Data gaps (do not fake these)

- No published base rate for: inbound acquisition offers to micro-SaaS, whale-customer inbound, viral post probability,
  creator mentions, or clone-after-viral. All game values are [design].
- No reliable indie-specific failure-reason survey.
- Private revenues (Levels, Dinh, Postma, Midjourney, Basecamp, Calendly, Lovable, Cursor) are self- or press-reported; several
  conflict. Use them only as narrative examples.
- RevenueCat's exact time window for the 17%/4.6% figures is reported by press as two years; the primary PDF was not read.
- BLS tables could not be fetched (access denied); 1-year/5-year numbers are secondary readings.

---

## Sources (accessed 2026-10-14 unless noted)

**Distributions**
- RevenueCat SOSA 2026 summary (2026-03-19, upd. 2026-04-22): https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026 ; report: https://www.revenuecat.com/state-of-subscription-apps
- 9to5Mac on SOSA 2026 (2026-03-04): https://9to5mac.com/2026/03/04/new-report-looks-into-the-sustainability-of-the-subscription-app-market-for-2026/
- Sherwood on SOSA 2025 (2025-03-19): https://sherwood.news/tech/data-shows-most-new-apps-dont-just-fail-they-completely-bomb ; TechRepublic: https://www.techrepublic.com/article/news-apps-revenue-developers/ ; Gigazine: https://gigazine.net/gsc_news/en/20250318-mobile-apps-subscriptions-revenue
- $72 median (secondary): https://arpubrothers.com/blog/revenuecat-subscription-app-report-2026/ ; https://termsandconditionstemplate.com/app-revenue-statistics-2026
- BigIdeasDB/TrustMRR (2026-07): https://bigideasdb.com/state-of-indie-saas-revenue-2026
- Indie Hackers Stripe-verified analysis (2022): https://www.indiehackers.com/post/how-much-money-do-indie-hackers-products-make-74db9631f0
- MicroConf State of Independent SaaS: https://microconf.com/state-of-indie-saas ; 2021 summary: https://www.indiehackers.com/post/the-2021-state-of-independent-saas-report-d010d8124b ; 2024 takeaways: https://www.startupsfortherestofus.com/episodes/episode-721-7-key-takeaways-from-the-2024-state-of-independent-saas-report ; stage page: https://microconf.com/founders/10k-100k-arr
- Stripe Atlas 2025 year in review (2025-12-18): https://stripe.com/blog/stripe-atlas-startups-in-2025-year-in-review
- Stripe, Indexing the AI economy: https://stripe.com/guides/indexing-the-ai-economy ; TechCrunch on Stripe letter (2025-02-27): https://techcrunch.com/2025/02/27/stripe-ceo-says-ai-startups-are-growing-faster-than-saas-ever-did-and-calling-them-wrappers-misses-the-point
- ChartMogul SaaS Growth Report 2023 (2023-08-30): https://chartmogul.com/reports/saas-growth-report/2023/ ; VC vs bootstrapped (2024-06-12): https://chartmogul.com/reports/saas-growth-vc-bootstrapped/
- Carta 2018 cohort (2025-02): https://carta.com/data/linkedin-2018-startups-six-year-outcomes/ ; https://carta.com/data/linkedin-2018-startup-cohort-outcomes-2025/
- Carta seed→A: https://carta.com/data/linkedin-seed-to-series-a-still-uphill-battle/ ; PMF Show summaries: https://www.pmf.show/blog/seed-to-series-a-gap-2025-carta-data ; https://www.pmf.show/blog/series-a-2026-benchmarks-venture-capital-trends
- Causo shutdown/runway compilation (PitchBook, Carta; 2026): https://hub.causo.ai/guides/startup-shutdowns-and-runway-data-2026
- Unicorn rates: https://angellist.com/blog/angellist-unicorn-rate ; Carta quartiles chart: https://datawrapper.dwcdn.net/ktdRG/2/
- Carta solo founders: https://carta.com/data/solo-founders-report ; https://fourweekmba.com/solo-founders-rise-from-23-7-to-36-3-ai-tools-enable-the-one-person-startup/
- TechCrunch shutdowns (2025-01-26): https://techcrunch.com/2025/01/26/2025-will-likely-be-another-brutal-year-of-failed-startups-data-suggests
- SimpleClosure State of Startup Shutdowns 2025 (2025-12-03): https://simpleclosure.com/blog/insights/state-of-startup-shutdowns-2025
- Bessemer State of AI 2025 (mirror): https://openlinksw.com/data/html/bessemer-ventures-ai-2025-report-claude.html
- BLS TED (2024): https://www.bls.gov/opub/ted/2024/34-7-percent-of-business-establishments-born-in-2013-were-still-operating-in-2023.htm ; BED: https://www.bls.gov/bdm/bdmage.htm ; secondary: https://startbusinessbystate.com/business-survival-rates-by-state
- Greenberg & Mollick: https://www.stern.nyu.edu/experience-stern/faculty-research/venture-investors-take-note-solo-founders-outperform-teams

**Failure**
- CB Insights (2026-03-05): https://www.cbinsights.com/research/report/startup-failure-reasons-top/
- HBS, Ghosh (2011-03-07): https://www.library.hbs.edu/working-knowledge/why-companies-failand-how-their-founders-can-bounce-back
- Startup Genome premature scaling (2011): https://startupgenome.com/report/why-startups-fail-premature-scaling/why-startups-fail-premature-scaling ; https://www.geekwire.com/2011/number-reason-startups-fail-premature-scaling/
- Failory cemetery: https://www.failory.com/cemetery
- Builder.ai: https://sifted.eu/articles/builder-ai-investigation-potentially-bogus-sales ; https://siliconcanals.com/uks-builder-ai-collapses/
- Humane/HP (2025-02): https://www.fortune.com/2025/02/19/hp-humane-deal-ai-pin-shutting-down ; https://the-decoder.com/humane-ends-its-ai-pin-in-ten-days-sells-technology-to-hp-for-116-million/
- Jasper: https://www.maginative.com/article/jasper-cuts-internal-valuation-as-ai-growth-slows/ ; https://sacra.com/research/copy-ai-jasper-ai-writing-tools
- Gumroad (2019-02): https://sahillavingia.com/reflecting
- Adobe–Figma termination (2023-12-18): https://www.verdict.co.uk/newsletters/adobe-terminates-20bn-figma-acquisition

**Luck, skill, timing**
- Gompers et al., JFE 2010: https://gwern.net/doc/economics/2010-gompers.pdf ; HBS WK: https://www.library.hbs.edu/working-knowledge/the-success-of-persistent-entrepreneurs ; https://corpgov.law.harvard.edu/2010/04/16/performance-persistence-in-entrepreneurship-and-venture-capital
- Azoulay, Jones, Kim, Miranda (NBER w24489; AER: Insights 2020): https://www.nber.org/papers/w24489
- Bill Gross TED 2015: https://tech.co/bill-gross-ted-2015-06 ; critique: https://timberry.bplans.com/startup-keys-to-success-timing
- Jason Roberts, Luck Surface Area (~2010): https://www.codusoperandi.com/posts/increasing-your-luck-surface-area
- Camuffo et al. 2020: https://www.innovationgrowthlab.org/blog/what-are-effects-scientific-approach-entrepreneurial-experimentation ; replication (CEPR DP15972): https://causalclaims.trfetzer.com/paper/DP15972.html
- HN: https://www.amplifypartners.com/blog-posts/what-gets-to-the-front-page-of-hacker-news ; https://gwern.net/HN ; IH HN postmortems: https://www.indiehackers.com/post/front-page-of-hn-the-full-postmortem-traffic-lessons-surprises-cbe9e0a7f6
- PMF timing (High Alpha survey): https://pmf.highalpha.com

**Elite stories**
- Levels: https://levels.io/projects (upd. 2026-10-03) ; https://www.indiehackers.com/post/he-built-70-failed-apps-before-making-300k-month-levelsios-story-eb21cb3b79
- Marc Lou: https://www.starterstory.com/marc-lou-shipfast ; https://www.indiehackers.com/post/marc-louvion-s-unconventional-approach-to-marketing-that-grew-ship-fast-to-43k-monthly-revenue-in-2-months-6163fb113f
- Tony Dinh: https://www.indiehackers.com/post/making-10k-mo-by-building-a-better-chatgpt-ui-5e69b67949 ; https://nomadpreneur.beehiiv.com/p/solo-founder-who-turned-100-into-1-500-000-no-team-no-investors
- Danny Postma: https://www.indiehackers.com/post/danny-postma-built-and-sold-ai-writing-tool-for-1m-in-8-months-full-story-7da7a7edf7
- Plausible: https://plausible.io/blog/bootstrapping-saas ; https://tinyempires.substack.com/p/inside-a-tiny-empire-plausible-analytics
- Tally: https://blog.tally.so/from-2-to-3m-arr-how-we-bootstrapped-tally-with-a-tiny-team/ ; https://blog.tally.so/the-road-from-4m-to-5m-arr/
- ConvertKit: https://mailshake.com/blog/story-nathan-barry/ ; https://5to9.beehiiv.com/p/nathan-barry-bootstrapping-side-project-33-million-arr
- Ahrefs: https://getlatka.com/interviews/ahrefs-tim-soulo-2024 ; https://getlatka.com/companies/ahrefs
- Mailchimp: https://en.wikipedia.org/wiki/Mailchimp
- Zapier: https://www.ycombinator.com/blog/learnings-of-a-ceo-wade-foster-zapier ; https://getlatka.com/interviews/zapier-wade-foster-2019
- Calendly: https://techcrunch.com/2021/04/08/bootstrapping-managing-product-led-growth-and-knowing-when-to-fundraise/ ; https://getlatka.com/blog/calendly-tope
- Canva: https://www.lennysnewsletter.com/p/the-making-of-canva
- Figma: https://sacra.com/c/figma/ ; https://www.iposcoop.com/ipo/figma/
- Slack: https://techcrunch.com/2019/05/30/the-slack-origin-story
- Notion: https://figma.com/blog/design-on-a-deadline-how-notion-pulled-itself-back-from-the-brink-of-failure/
- Superhuman (2018-11): https://blog.superhuman.com/how-superhuman-built-an-engine-to-find-product-market-fit/
- Linear: https://dealroom.co/news/147084-linear-doubles-valuation-to-2-5b-defying-the-saas-is-dead-narrative/
- Cursor: https://en.wikipedia.org/wiki/Anysphere
- Lovable: https://www.techdogs.com/tech-news/td-newsdesk/lovable-hits-400m-arr-in-february-adds-100m-in-a-month-with-146-employees ; https://www.arr.club/lovable/lovable-arr-hit-50m-in-6-months
- Bolt: https://www.lennysnewsletter.com/p/inside-bolt-eric-simons
- Base44: https://en.globes.co.il/en/article-wix-acquires-israeli-vibe-coding-co-base44-1001513267 ; https://www.calcalistech.com/tags/Base44
- Midjourney: https://sacra.com/c/midjourney/ ; https://getlatka.com/companies/midjourney
- Cal AI: https://techcrunch.com/?p=2979629 ; https://letsdatascience.com/news/cal-ai-sells-to-myfitnesspal-after-rapid-growth-f789c949
- Paul Graham, Do Things That Don't Scale (2013-07): https://paulgraham.com/ds.html
