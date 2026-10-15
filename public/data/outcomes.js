// Outcome distributions, elite founder behaviours, failure modes and luck events for the founder simulator.
// Research notes and full source list: docs/research/outcomes-success-failure.md (compiled 2026-10-14).
// Existing negative world events (competitors, AI labs, platforms, outages, security, life) live in
// public/data/world.js WORLD_EVENTS; this file only adds the positive tail and a few missing negatives,
// and references world.js ids in `relatedWorldEvents` instead of duplicating them.
//
// Conventions
// - Ranges are [lo, hi]. Money in USD. Probabilities/percentages are fractions (0.17 = 17%).
// - MRR thresholds: "1k" = $1,000 MRR, "10k" = $10,000 MRR, "100k" = $100,000 MRR. Months are from launch
//   (first public availability) unless the key says otherwise.
// - OUTCOME_TARGETS describe the population of founders who START on that path/model (not survivors), unless the key
//   says "IfReached" / "RevenueEarners". They are calibration targets for bot runs, not rules.
// - Labels inside source strings: [P] primary data, [S] secondary report of data, [V] vendor data,
//   [A] anecdote/self-report, [Q] qualitative. Anything marked '[design]' is a game estimate bounded by the cited
//   data. Never show a [design] value to players as a real statistic.
// - Luck event rates: effective annual rate = baseRatePerYear * surfaceMultiplier(event, activity), see luckRate().

const S = {
  rcSosa26: 'RevenueCat State of Subscription Apps 2026 (115k+ apps, published 2026-03-19) [V/P]: https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026',
  rcThresholds: 'RevenueCat SOSA 2025/2026 via 9to5Mac 2026-03-04 and Sherwood 2025-03-19: 19%→17% of new apps reach $1k/mo, 5.3%→4.6% reach $10k/mo, window reported as 2 years [S]: https://9to5mac.com/2026/03/04/new-report-looks-into-the-sustainability-of-the-subscription-app-market-for-2026/ ; https://sherwood.news/tech/data-shows-most-new-apps-dont-just-fail-they-completely-bomb',
  rcMedian: 'Median subscription app ≈$72/month one year after launch (secondary coverage of SOSA 2026, not on summary page) [S]: https://arpubrothers.com/blog/revenuecat-subscription-app-report-2026/',
  rcTopBottom: 'SOSA 2025: top 5% of new apps ≈$8,888 vs bottom 25% ≤$19 (>400x) [S]: https://www.techrepublic.com/article/news-apps-revenue-developers/',
  trustmrr: 'BigIdeasDB/TrustMRR, 3,787 revenue-reporting of 8,699 tracked indie startups, Jul 2026: p25 $29, p50 $145, p75 $894, p90 $5,107, p95 $13,205 MRR [V]: https://bigideasdb.com/state-of-indie-saas-revenue-2026',
  ihStripe: 'Indie Hackers Stripe-verified products (2022, ~937–970): >54% at $0, ~5% above ~$100k/yr [S]: https://www.indiehackers.com/post/how-much-money-do-indie-hackers-products-make-74db9631f0',
  microconf24: 'MicroConf State of Independent SaaS 2024: ~30% grow 1–4% MoM, ~30% flat/shrinking; $1,000+/mo entry plans add ≈$1,073 new MRR/mo vs ≈$316 for $1–9 plans; enterprise focus ≈27% MoM [S]: https://www.startupsfortherestofus.com/episodes/episode-721-7-key-takeaways-from-the-2024-state-of-independent-saas-report ; https://microconf.com/founders/10k-100k-arr',
  atlas25: 'Stripe Atlas 2025 year in review (2025-12-18): 20% charge first customer within 30 days of incorporation; median 34 days to first payment; 2.2% raised within 3 months [P]: https://stripe.com/blog/stripe-atlas-startups-in-2025-year-in-review',
  cm2023: 'ChartMogul SaaS Growth Report 2023-08-30 (2,200+ SaaS): median 2y9m to $1M ARR, top ~9 months; 13% reach $10M ARR after 10 yrs; median growth 2–2.5%/mo, top quartile 5–7%, top decile 10–17%; NRR>100% ≈54%/yr growth vs ≈12% at 60–80% [V/P]: https://chartmogul.com/reports/saas-growth-report/2023/',
  cm2024: 'ChartMogul × Dealroom 2024-06-12 (2,500+ SaaS): top-quartile bootstrapped reach $1M ARR in ~2 yrs, VC ~4 months faster [V/P]: https://chartmogul.com/reports/saas-growth-vc-bootstrapped/',
  carta2018: 'Carta 2018 founding cohort (4,369 US cos, as of 2025-01-01): 36.4% Series A, 14.8% B; 5.5% acquired, 1.3% unicorn, 0.34% IPO, 61.9% closed (overcounted) [S]: https://carta.com/data/linkedin-2018-startup-cohort-outcomes-2025/',
  cartaSeedA: 'Carta seed→A within 2 yrs: 30.6% (Q1 2018 seed) → 15.4% (Q1 2022); median seed→A 616 days (Q2 2025) [S]: https://carta.com/data/linkedin-seed-to-series-a-still-uphill-battle/ ; https://hub.causo.ai/guides/startup-shutdowns-and-runway-data-2026',
  pitchbookSeed: 'PitchBook (to 2025-09-30) via Causo: ~53% of consensus vs ~28% of non-consensus seed deals raised an A; 29.5% vs 39.4% went out of business [S]: https://hub.causo.ai/guides/startup-shutdowns-and-runway-data-2026',
  unicorn: 'Unicorn rate from seed: Carta 2025 0.8%–5.6% by seed-valuation quartile (2016–2020 cohorts); AngelList ~2.5% (2013–2019) [S]: https://angellist.com/blog/angellist-unicorn-rate ; https://datawrapper.dwcdn.net/ktdRG/2/',
  cbi2026: 'CB Insights 2026-03-05, 431 VC-backed shutdowns since 2023 (reasons for 385): ran out of capital 70%, poor PMF 43%, bad timing/macro 29%, unit economics 19%; median 22 months from last raise to death; ~1/4 lingered >3 yrs; median raised $11M [P]: https://www.cbinsights.com/research/report/startup-failure-reasons-top/',
  simpleclosure: 'SimpleClosure State of Startup Shutdowns 2025 (2025-12-03): Series A share of shutdowns ~6%→~14%; AI ~16% of shutdowns, mostly wrappers/app layer; median AI shutdown raised ~$2.4M [V]: https://simpleclosure.com/blog/insights/state-of-startup-shutdowns-2025',
  shutdownCounts: 'Carta 769 (2023) → 966 (2024) US shutdowns; AngelList 233 → 364 (TechCrunch 2025-01-26) [S]: https://techcrunch.com/2025/01/26/2025-will-likely-be-another-brutal-year-of-failed-startups-data-suggests',
  stripeAI: 'Stripe: top 100 AI companies reached $1M annualized revenue in median 11.5 months; AI cos at $30M+ took ~18 months vs ~5.5 yrs for top 2018 SaaS [P]: https://stripe.com/guides/indexing-the-ai-economy ; https://techcrunch.com/2025/02/27/stripe-ceo-says-ai-startups-are-growing-faster-than-saas-ever-did-and-calling-them-wrappers-misses-the-point',
  bessemer: 'Bessemer State of AI 2025-08-13 (20 cos): Supernovas ≈$40M ARR yr1, ≈$125M yr2, ~25% GM; Shooting Stars ≈$3M yr1 → ≈$103M yr4, ~60% GM [S]: https://openlinksw.com/data/html/bessemer-ventures-ai-2025-report-claude.html',
  bls: 'BLS: 34.7% of establishments born 2013 operating in 2023 [P]; ~78% 1-yr and ~51% 5-yr survival (secondary readings of BED) [S]: https://www.bls.gov/opub/ted/2024/34-7-percent-of-business-establishments-born-in-2013-were-still-operating-in-2023.htm ; https://startbusinessbystate.com/business-survival-rates-by-state',
  gompers: 'Gompers, Kovner, Lerner & Scharfstein, JFE 2010: success 30% after a prior success vs 18% first-time vs 20% after prior failure (HBS WK cut: 34/22/23) [P]: https://gwern.net/doc/economics/2010-gompers.pdf ; https://www.library.hbs.edu/working-knowledge/the-success-of-persistent-entrepreneurs',
  azoulay: 'Azoulay, Jones, Kim & Miranda, AER: Insights 2020 (NBER w24489): mean founder age of top 0.1% growth firms 45.0; same-industry experience predicts much greater success [P]: https://www.nber.org/papers/w24489',
  camuffo: 'Camuffo et al., Management Science 2020 (RCT, 116 startups) and CEPR DP15972 replication (759 firms, 4 RCTs): scientific/hypothesis-testing approach improves performance; pivot effect conflicts between studies [P]: https://www.innovationgrowthlab.org/blog/what-are-effects-scientific-approach-entrepreneurial-experimentation ; https://causalclaims.trfetzer.com/paper/DP15972.html',
  startupGenome: 'Startup Genome 2011 (3,200 startups): premature scaling in ~70%; 1–2 pivots associated with 3.6x user growth [P, circular definition — direction only]: https://startupgenome.com/report/why-startups-fail-premature-scaling/why-startups-fail-premature-scaling',
  grossTed: 'TED talk on startup success factors (2015): timing scored as 42% of difference across ~200 companies [Q — subjective scoring, small sample]: https://tech.co/bill-gross-ted-2015-06',
  lsa: '"Increase your Luck Surface Area" essay (~2010-11): L = D × T (doing × telling) [Q]: https://www.codusoperandi.com/posts/increasing-your-luck-surface-area',
  soleSurvivors: 'Greenberg & Mollick, "Sole Survivors" (Kickstarter ventures 2009–2015): solo for-profit founders ~2.5x as likely to survive [P, consumer/creative sample]: https://www.stern.nyu.edu/experience-stern/faculty-research/venture-investors-take-note-solo-founders-outperform-teams',
  cartaSolo: 'Carta Solo Founders Report 2025 / Founder Ownership Report: 30–36% of new startups solo-founded (2024–2025) but ~15–17% of priced-round cash [S]: https://carta.com/data/solo-founders-report',
  superhuman: 'Superhuman PMF engine (2018-11): "very disappointed" 22% → 33% after segmenting → 58% after ~3 quarters; 50/50 roadmap [P/A]: https://blog.superhuman.com/how-superhuman-built-an-engine-to-find-product-market-fit/',
  pgDontScale: '"Do Things That Don\'t Scale" essay (2013-07) — Stripe founders installing it by hand, Airbnb photos [Q]: see docs/research/outcomes-success-failure.md',
  levels: 'A solo maker public project list (upd. 2026-10-03): 116 projects — 9 success, 11 okay, 19 failed, 71 n/a, 6 new [A]: see docs/research/outcomes-success-failure.md',
  marcLou: 'A solo maker of developer boilerplates: ~16–21 products in ~2–3 yrs; ShipFast $6k in 48h (2023-08); DataFast 124 days to $1k MRR [A]: see docs/research/outcomes-success-failure.md',
  dinh: 'TypingMind (solo founder): ChatGPT UI shipped within weeks of the API; ~$33k/mo early; reported $130–160k/mo late 2025 [A/S]: https://www.indiehackers.com/post/making-10k-mo-by-building-a-better-chatgpt-ui-5e69b67949 ; https://nomadpreneur.beehiiv.com/p/solo-founder-who-turned-100-into-1-500-000-no-team-no-investors',
  postma: 'A solo AI-app maker: Headlime (GPT-3) sold within ~8 months; HeadshotPro [A]: see docs/research/outcomes-success-failure.md',
  plausible: 'Plausible: $400 → $10k MRR in 9 months, $1M ARR, ~$3.1M ARR late 2024; no paid ads [A/S]: https://plausible.io/blog/bootstrapping-saas ; https://tinyempires.substack.com/p/inside-a-tiny-empire-plausible-analytics',
  tally: 'Tally: $2M ARR (2025-02) → $3M (2025-06) → $4M (2025-10) → $5M (2026), team 8–11, free tier PLG [A]: https://blog.tally.so/from-2-to-3m-arr-how-we-bootstrapped-tally-with-a-tiny-team/',
  convertkit: 'ConvertKit/Kit: ~2 yrs at $1–2k MRR, went all-in, direct sales to bloggers, repositioned for creators; ~$100k MRR by 2016; ~$33M ARR 2022 [A/S]: https://mailshake.com/blog/story-nathan-barry/ ; https://5to9.beehiiv.com/p/nathan-barry-bootstrapping-side-project-33-million-arr',
  zapier: 'Zapier: ~$1.3M seed only; profitable since ~2014; integration pages (~25k SEO pages) and partner co-marketing as main levers [S]: https://www.ycombinator.com/blog/learnings-of-a-ceo-wade-foster-zapier ; https://getlatka.com/interviews/zapier-wade-foster-2019',
  calendly: 'Calendly: self-funded, $550k seed 2014, ~$100k ARR within 4 months of monetizing; $350M Series B at $3B (2021-01) [S]: https://techcrunch.com/2021/04/08/bootstrapping-managing-product-led-growth-and-knowing-when-to-fundraise/ ; https://getlatka.com/blog/calendly-tope',
  mailchimp: 'Mailchimp: agency side project 2001, all-in 2007, freemium 2009, never raised; Intuit ~$12B (closed 2021-11-01) [S]: https://en.wikipedia.org/wiki/Mailchimp',
  ahrefs: 'Ahrefs: bootstrapped, product-led content, >$100M revenue (Latka 2024 interview), ~$149M 2024 (estimate) [S]: https://getlatka.com/interviews/ahrefs-tim-soulo-2024',
  canva: 'Canva: 100+ investor rejections; launched 2013; >$3B revenue, profitable 8 yrs (2025) [S]: see docs/research/outcomes-success-failure.md',
  figma: 'Figma: founded 2012, launch 2016, paid 2017; ~$0.7M (2017) → $75M (2020, est.); Adobe deal killed 2023-12-18 with $1B fee; IPO 2025-07-31 [S]: https://sacra.com/c/figma/ ; https://www.verdict.co.uk/newsletters/adobe-terminates-20bn-figma-acquisition',
  slack: 'Slack: pivot from failed game Glitch (2012) [S]: https://techcrunch.com/2019/05/30/the-slack-origin-story',
  notion: 'Notion 2015 near-death: let team of 4 go, moved to Kyoto, rewrote app [S]: https://figma.com/blog/design-on-a-deadline-how-notion-pulled-itself-back-from-the-brink-of-failure/',
  linear: 'Linear: profitable since ~year 2; >$100M ARR, $2.5B tender (2026) [S]: https://dealroom.co/news/147084-linear-doubles-valuation-to-2-5b-defying-the-saas-is-dead-narrative/',
  cursor: 'Cursor/Anysphere: ~$100M ARR 2025-01, ~$500M mid-2025, $1B 2025-11 [S]: https://en.wikipedia.org/wiki/Anysphere',
  lovable: 'Lovable: $17M ARR in 3 months; $100M ~2025-07; $200M 2025-11; $400M 2026-02 [S]: https://www.techdogs.com/tech-news/td-newsdesk/lovable-hits-400m-arr-in-february-adds-100m-in-a-month-with-146-employees',
  bolt: 'Bolt.new/StackBlitz: near shutdown after ~7 yrs; $0 → $20M ARR in ~2 months, ~$40M in ~5 months after a late-2024 frontier-model release [A]: see docs/research/outcomes-success-failure.md',
  base44: 'Base44: solo side project, ~6 months, Wix $80M + earnout (2025-06) [S]: https://en.globes.co.il/en/article-wix-acquires-israeli-vibe-coding-co-base44-1001513267',
  midjourney: 'Midjourney: no outside funding; revenue estimates ~$200M (2023) to ~$500M (2025), conflicting [S]: https://sacra.com/c/midjourney/',
  calai: 'Cal AI: influencer/TikTok distribution; founder-claimed 5M downloads in 8 months; >$30M annual revenue; acquired by MyFitnessPal [A/S]: https://techcrunch.com/?p=2979629 ; https://letsdatascience.com/news/cal-ai-sells-to-myfitnesspal-after-rapid-growth-f789c949',
  gumroad: 'Gumroad founder\'s public post-mortem (2019-02): laid off 75% [A]: see docs/research/outcomes-success-failure.md',
  builderai: 'Builder.ai 2025: revenue restated ($220M→~$55M for 2024), lender seized cash, insolvency [S]: https://sifted.eu/articles/builder-ai-investigation-potentially-bogus-sales',
  humane: 'Humane AI Pin: sold parts to HP for $116M after seeking $750M–$1B; device shut down 2025-02-28 [S]: https://www.fortune.com/2025/02/19/hp-humane-deal-ai-pin-shutting-down',
  jasper: 'Jasper 2023: ChatGPT replaced prosumer subs; forecast cut ≥30%, internal valuation −20%, layoffs [S]: https://www.maginative.com/article/jasper-cuts-internal-valuation-as-ai-growth-slows/',
  failory: 'Failory cemetery (~120 cases): lack of funds 38%, no market need 35% (via Colorlib) [S]: https://www.failory.com/cemetery',
  hn: 'HN: Show HN ≈15% of stories (gwern, to 2026-01); front-page anecdotes 678–35,000 visits, 14–125 signups [S/A]: https://gwern.net/HN ; https://www.indiehackers.com/post/front-page-of-hn-the-full-postmortem-traffic-lessons-surprises-cbe9e0a7f6',
  phDoc: 'Product Hunt top 3 <5% base rate; one-day spike (see docs/research/marketing-and-ads.md) [S]',
  pressDoc: 'Journalists answer ~2.5–3.5% of pitches (see docs/research/channels-partnerships-pricing.md) [S]',
  exitDoc: 'Micro-SaaS exits 2–4x TTM revenue / 4–6x SDE; strategic deals rare and inbound (see docs/research/fundraising.md) [P/S]',
  worldDoc: 'See docs/research/world-ops-support-life.md and public/data/world.js WORLD_EVENTS',
  cofounderDoc: 'Co-founder departure ~25% of VC-backed by year 4 (Carta 2024-12, see docs/research/world-ops-support-life.md) [S]',
  burnoutDoc: 'Founder burnout ~54%/yr (Sifted 2025-02, see docs/research/world-ops-support-life.md) [S]',
  financeDoc: 'Stripe reserves/payout delays for risky accounts (see docs/research/finance-and-payments.md) [P]',
};

const D = '[design] game estimate bounded by the sources above';

// ---------------------------------------------------------------------------------------------------------------
// 1. Calibration targets per path × model. Each metric is [lo, hi]. `sources[metric]` explains the basis.
// ---------------------------------------------------------------------------------------------------------------

export const OUTCOME_TARGETS = {
  meta: {
    compiled: '2026-10-14',
    population: 'founders who START on the path/model (launch something); includes those who quit',
    howToUse: 'Run ≥1,000 seeded bots per cell with POLICIES.average; percentiles and shares must fall in range. Then run elite and mistakes policies and check POLICIES expectations.',
  },

  indie: {
    b2c: {
      pctAnyRevenueBy12mo: [0.35, 0.6],
      pctReach1kMrrBy12mo: [0.1, 0.15],
      pctReach1kMrrBy24mo: [0.17, 0.19],
      pctReach10kMrrBy12mo: [0.02, 0.035],
      pctReach10kMrrBy24mo: [0.046, 0.053],
      pctReach100kMrrBy36mo: [0.003, 0.008],
      medianMrrAt12mo: [50, 100],
      bottomQuartileMrrAt12mo: [0, 19],
      p95MrrAt24mo: [6000, 12000],
      medianDaysTo1kIfReached: [45, 90],
      annualPlanYear1CancelRate: [0.56, 0.72],
      pctStillActiveAt36mo: [0.25, 0.45],
      sources: {
        pctAnyRevenueBy12mo: `${S.rcTopBottom}; ${D}`,
        pctReach1kMrrBy12mo: `${S.rcThresholds}; ${D} (most apps that reach $1k do so fast)`,
        pctReach1kMrrBy24mo: S.rcThresholds,
        pctReach10kMrrBy12mo: `${S.rcThresholds}; ${D}`,
        pctReach10kMrrBy24mo: S.rcThresholds,
        pctReach100kMrrBy36mo: `${S.rcTopBottom}; ${D}`,
        medianMrrAt12mo: S.rcMedian,
        bottomQuartileMrrAt12mo: S.rcTopBottom,
        p95MrrAt24mo: `${S.rcTopBottom} (top 5% ≈$8,888)`,
        medianDaysTo1kIfReached: 'SOSA 2025 via TechRepublic/Gigazine: ~60 days among apps that reached $1k [S]',
        annualPlanYear1CancelRate: S.rcSosa26,
        pctStillActiveAt36mo: `${S.bls}; ${D}`,
      },
    },

    smb: {
      pctAnyRevenueBy12mo: [0.4, 0.6],
      pctFirstCustomerWithin30dOfLaunch: [0.15, 0.25],
      pctReach1kMrrBy12mo: [0.1, 0.18],
      pctReach10kMrrBy24mo: [0.03, 0.06],
      pctReach100kMrrBy36mo: [0.002, 0.005],
      medianMrrAt12moAllStarters: [0, 50],
      medianMrrAt24moRevenueEarners: [100, 300],
      revenueEarnerMrrPercentiles: { p25: 29, p50: 145, p75: 894, p90: 5107, p95: 13205 },
      monthlyGrowthOfSurvivors: { median: [0.02, 0.025], topQuartile: [0.05, 0.07], topDecile: [0.1, 0.17] },
      pctFlatOrShrinkingAmongEstablished: [0.25, 0.35],
      monthsTo1MArrIfReached: { median: [30, 36], topQuartile: [22, 26] },
      pctStillActiveAt36mo: [0.3, 0.5],
      sources: {
        pctAnyRevenueBy12mo: `${S.ihStripe}; ${S.trustmrr} (44% report revenue); ${D}`,
        pctFirstCustomerWithin30dOfLaunch: `${S.atlas25} (measured from incorporation, all company types)`,
        pctReach1kMrrBy12mo: `${S.trustmrr} (p75 of earners ≈$894); ${D}`,
        pctReach10kMrrBy24mo: `${S.trustmrr}; ${S.ihStripe}; ${D}`,
        pctReach100kMrrBy36mo: `${S.cm2023}; ${D}`,
        medianMrrAt12moAllStarters: `${S.ihStripe}; ${D}`,
        medianMrrAt24moRevenueEarners: S.trustmrr,
        revenueEarnerMrrPercentiles: `${S.trustmrr} (business age not controlled)`,
        monthlyGrowthOfSurvivors: S.cm2023,
        pctFlatOrShrinkingAmongEstablished: S.microconf24,
        monthsTo1MArrIfReached: `${S.cm2023}; ${S.cm2024}`,
        pctStillActiveAt36mo: `${S.bls}; ${D}`,
      },
    },

    ent: {
      pctFirstContractBy12mo: [0.15, 0.3],
      medianMonthsToFirstContractIfReached: [6, 12],
      pctReach10kMrrBy24mo: [0.04, 0.1],
      pctReach100kMrrBy36mo: [0.004, 0.012],
      medianMrrAt12moAllStarters: [0, 0],
      monthlyGrowthOfSurvivors: { median: [0.02, 0.04], topQuartile: [0.06, 0.1] },
      pctStillActiveAt36mo: [0.25, 0.45],
      sources: {
        pctFirstContractBy12mo: `${D}; lumpy, few customers; no indie-enterprise dataset exists`,
        medianMonthsToFirstContractIfReached: `${D}; enterprise cycles 3–9 months (see docs/research/sales-and-research.md)`,
        pctReach10kMrrBy24mo: `${S.microconf24} (enterprise focus correlates with faster growth, small n); ${D}`,
        pctReach100kMrrBy36mo: D,
        medianMrrAt12moAllStarters: D,
        monthlyGrowthOfSurvivors: `${S.microconf24}; ${S.cm2023}; ${D}`,
        pctStillActiveAt36mo: D,
      },
    },
  },

  vc: {
    b2c: {
      pctSeriesAWithin24moOfSeed: [0.1, 0.2],
      pctReach1MArrBy24mo: [0.05, 0.15],
      pctReach10MArrBy60mo: [0.01, 0.04],
      pctUnicornEver: [0.005, 0.02],
      pctAcquiredBy72mo: [0.03, 0.08],
      pctShutdownBy72mo: [0.5, 0.65],
      medianMonthsLastRaiseToShutdown: [18, 26],
      sources: {
        pctSeriesAWithin24moOfSeed: `${S.cartaSeedA}; ${D} (consumer below overall)`,
        pctReach1MArrBy24mo: `${S.cm2024}; ${D}`,
        pctReach10MArrBy60mo: `${S.cm2023}; ${D}`,
        pctUnicornEver: `${S.unicorn}; ${S.carta2018}`,
        pctAcquiredBy72mo: S.carta2018,
        pctShutdownBy72mo: `${S.carta2018}; ${S.pitchbookSeed}`,
        medianMonthsLastRaiseToShutdown: S.cbi2026,
      },
    },
    smb: {
      pctSeriesAWithin24moOfSeed: [0.15, 0.3],
      medianMonthsSeedToSeriesA: [18, 22],
      pctReach1MArrBy24mo: [0.1, 0.25],
      pctReach10MArrBy60mo: [0.03, 0.08],
      pctUnicornEver: [0.01, 0.025],
      pctAcquiredBy72mo: [0.03, 0.06],
      pctShutdownBy72mo: [0.5, 0.62],
      medianMonthsLastRaiseToShutdown: [18, 26],
      aiBreakout: { pctReach1MArrBy12mo: [0.03, 0.08], pctReach30MArrBy24mo: [0.002, 0.01] },
      sources: {
        pctSeriesAWithin24moOfSeed: S.cartaSeedA,
        medianMonthsSeedToSeriesA: S.cartaSeedA,
        pctReach1MArrBy24mo: `${S.cm2024}; ${D}`,
        pctReach10MArrBy60mo: `${S.cm2023}; ${D}`,
        pctUnicornEver: S.unicorn,
        pctAcquiredBy72mo: S.carta2018,
        pctShutdownBy72mo: `${S.carta2018}; ${S.pitchbookSeed}; ${S.shutdownCounts}`,
        medianMonthsLastRaiseToShutdown: S.cbi2026,
        aiBreakout: `${S.stripeAI}; ${S.bessemer}; ${D} (only for aiDependence core + capability tailwind)`,
      },
    },
    ent: {
      pctSeriesAWithin24moOfSeed: [0.15, 0.3],
      medianMonthsSeedToSeriesA: [18, 24],
      pctFirstContractBy12mo: [0.4, 0.7],
      pctReach1MArrBy24mo: [0.1, 0.25],
      pctReach10MArrBy60mo: [0.03, 0.08],
      pctUnicornEver: [0.01, 0.025],
      pctAcquiredBy72mo: [0.04, 0.08],
      pctShutdownBy72mo: [0.5, 0.62],
      medianMonthsLastRaiseToShutdown: [18, 26],
      sources: {
        pctSeriesAWithin24moOfSeed: S.cartaSeedA,
        medianMonthsSeedToSeriesA: S.cartaSeedA,
        pctFirstContractBy12mo: `${D}; design partners/pilots common at seed`,
        pctReach1MArrBy24mo: `${S.cm2024}; ${D}`,
        pctReach10MArrBy60mo: `${S.cm2023}; ${D}`,
        pctUnicornEver: S.unicorn,
        pctAcquiredBy72mo: `${S.carta2018}; ${D}`,
        pctShutdownBy72mo: `${S.carta2018}; ${S.pitchbookSeed}`,
        medianMonthsLastRaiseToShutdown: S.cbi2026,
      },
    },
  },

  // Expected effect of bot policies relative to POLICIES.average (all [design]).
  policies: {
    average: 'Ships monthly, 1–2 customer conversations/week, 1 launch, prices at market median, no ICP narrowing, posts rarely.',
    elite: 'All ELITE_BEHAVIORS at their thresholds, within the same weekly hour budget.',
    mistakes: 'Builds 6+ months before talking to users, free/underpriced, broad ICP, scales spend before retention, raises then hires ahead of revenue, ignores churn.',
    expectations: {
      eliteMedianMrrAt24moMultiple: [3, 10],
      eliteP90MrrAt24moMultiple: [3, 5],
      elitePctStillBelow10kMrrAt24moIndie: [0.3, 0.5], // good play raises odds, never guarantees (CLAUDE.md asymmetry rule)
      elitePctReach100kMrrBy36moIndie: [0.01, 0.03],
      mistakesPctDeadOrQuitBy24mo: [0.8, 1], // research §5.1: "should fail ≥80% of the time" (a floor)
      mistakesPctReach10kMrrBy24moIndie: [0.0, 0.01],
    },
    sources: `${D}; outsized-but-not-guaranteed shape informed by ${S.levels} and ${S.gompers}`,
  },
};

// ---------------------------------------------------------------------------------------------------------------
// 2. Elite behaviours. `measurableInGame.signals` are proposed state/activity stats (weekly or rolling windows).
//    `effect` magnitudes are [design] unless the source says otherwise. Effects stack multiplicatively but each is
//    capped; diminishing returns above ~2x the threshold.
// ---------------------------------------------------------------------------------------------------------------

export const ELITE_BEHAVIORS = [
  {
    id: 'customer_contact',
    label: 'Talks to customers every week',
    description: 'Runs discovery/feedback conversations every week, especially pre-PMF, with real (paying or ICP) users, Mom-Test style; acts on what they say.',
    examples: ['Superhuman', 'Stripe', 'Airbnb', 'ConvertKit', 'Calendly'],
    measurableInGame: {
      text: '≥5 customer/ICP conversations per week over the last 4 weeks (≥3 after PMF)',
      signals: [{ stat: 'customerConversationsPerWeek', op: '>=', value: 5, windowDays: 28 }],
    },
    effect: {
      mechanic: 'Reveals hidden ICP pain and product-fit variables faster; raises product-fit score growth per shipped feature; reduces chance of building unwanted features.',
      magnitude: 'PMF discovery speed ×1.3–1.8; wasted-feature probability ×0.5–0.7',
    },
    sources: [S.superhuman, S.camuffo, S.pgDontScale, D],
  },
  {
    id: 'pmf_measurement',
    label: 'Measures product-market fit and segments',
    description: 'Runs a Sean Ellis "very disappointed" survey, segments to the users who love it, builds a high-expectation-customer profile and splits the roadmap ~50/50 between what lovers love and what holds others back.',
    examples: ['Superhuman', 'Slack'],
    measurableInGame: {
      text: 'PMF survey run ≥1 per quarter with ≥40 responses; roadmap items tagged to a segment',
      signals: [
        { stat: 'pmfSurveysPerQuarter', op: '>=', value: 1 },
        { stat: 'pmfSurveyResponses', op: '>=', value: 40 },
      ],
    },
    effect: {
      mechanic: 'Makes the latent fit score visible to the player (with noise) and lets them retarget; segmenting raises measured fit immediately.',
      magnitude: 'Fit visibility on; segmentation +5–15 pts "very disappointed" (Superhuman 22%→33% by segmenting alone)',
    },
    sources: [S.superhuman],
  },
  {
    id: 'ship_fast',
    label: 'Ships small and often',
    description: 'Releases user-visible improvements weekly, uses AI coding agents, keeps scope small, fixes reported bugs within days.',
    examples: ['Photo AI / Nomad List (solo maker)', 'ShipFast (solo maker)', 'Cursor', 'Lovable', 'Linear'],
    measurableInGame: {
      text: '≥1 user-visible release per week averaged over 8 weeks',
      signals: [{ stat: 'releasesPerWeek', op: '>=', value: 1, windowDays: 56 }],
    },
    effect: {
      mechanic: 'More iterations per month on the fit search; each release also adds a small "doing" term to luck surface area and a changelog post opportunity.',
      magnitude: 'Fit-search iterations ×1.5–2; churn from unresolved bugs ×0.85',
    },
    sources: [S.levels, S.marcLou, S.cursor, S.lovable, D],
  },
  {
    id: 'many_shots',
    label: 'Takes many cheap shots on goal',
    description: 'Launches many small products/experiments publicly, kills losers fast (weeks, not years), doubles down on the one that pulls.',
    examples: ['Photo AI / Nomad List', 'ShipFast', 'HeadshotPro', 'TypingMind'],
    measurableInGame: {
      text: '≥1 public launch (new product, major feature or free tool) per quarter; ≥3 in first 12 months; kills experiments with no pull within 4–8 weeks',
      signals: [
        { stat: 'publicLaunchesPerQuarter', op: '>=', value: 1 },
        { stat: 'medianWeeksToKillFailedExperiment', op: '<=', value: 8 },
      ],
    },
    effect: {
      mechanic: 'Each launch is an independent draw on breakout luck (see LUCK_EVENTS viral/HN/PH); skill sets odds per draw, audience sets payoff.',
      magnitude: 'Per-launch breakout odds 0.05–0.10 for a skilled audience-backed maker [design from public maker portfolios: ~9 of 116 and ~1 of 20 products succeeded]',
    },
    sources: [S.levels, S.marcLou, S.postma, S.lsa],
  },
  {
    id: 'build_in_public',
    label: 'Builds in public and grows an audience',
    description: 'Posts specific progress, numbers and lessons several times a week on X/LinkedIn/communities; grows an email list. Telling term of luck surface area.',
    examples: ['Photo AI / Nomad List', 'ShipFast', 'TypingMind', 'Kit (ConvertKit)', 'Base44'],
    measurableInGame: {
      text: '≥3 substantive public posts per week for 8+ weeks; audience growing ≥5%/month',
      signals: [
        { stat: 'publicPostsPerWeek', op: '>=', value: 3, windowDays: 56 },
        { stat: 'audienceGrowthMonthly', op: '>=', value: 0.05 },
      ],
    },
    effect: {
      mechanic: 'Raises rates of positive LUCK_EVENTS (viral, creator mention, investor/acquirer inbound) and launch-day reach; compounds over time.',
      magnitude: 'Launch-day signups ∝ audience^0.6–0.8 [design]; luck surface weight see LUCK_EVENTS.surfaceArea.publicPostsPerWeek/audienceSize',
    },
    sources: [S.lsa, S.marcLou, S.levels, D],
  },
  {
    id: 'charge_early',
    label: 'Charges from day one and prices for value',
    description: 'Takes money (pre-sales, paid pilots, paywall) before or at launch; prices at or above market median; raises prices as value grows.',
    examples: ['Photo AI', 'Superhuman', 'Cal AI', 'Linear'],
    measurableInGame: {
      text: 'First charge ≤30 days after launch; entry price ≥ market median for the model; no free plan without a conversion path',
      signals: [
        { stat: 'daysFromLaunchToFirstCharge', op: '<=', value: 30 },
        { stat: 'entryPriceVsMarketMedian', op: '>=', value: 1.0 },
      ],
    },
    effect: {
      mechanic: 'Early, honest demand signal (paying ≠ liking); higher ARPA lets fewer customers sustain the founder; filters non-ICP users.',
      magnitude: 'New MRR per new customer ×1.5–3 vs bottom-tier pricing (MicroConf ≈3.4x correlational); fit-signal noise ×0.7',
    },
    sources: [S.microconf24, S.atlas25, S.superhuman],
  },
  {
    id: 'narrow_icp',
    label: 'Narrows to a sharp ICP',
    description: 'Picks one segment with acute pain and a reachable channel; says no to others until it dominates; repositions on evidence.',
    examples: ['Superhuman', 'ConvertKit', 'Linear', 'Plausible'],
    measurableInGame: {
      text: 'One primary ICP segment set; ≥70% of new customers and outreach in that segment over 8 weeks',
      signals: [
        { stat: 'icpSegments', op: '<=', value: 1 },
        { stat: 'shareOfNewCustomersInIcp', op: '>=', value: 0.7, windowDays: 56 },
      ],
    },
    effect: {
      mechanic: 'Raises conversion, word of mouth and retention inside the segment; lowers addressable market until the player expands.',
      magnitude: 'Landing/trial conversion ×1.3–2 in-segment; referral K +0.05–0.15; TAM ceiling ×0.2–0.5 until expansion',
    },
    sources: [S.superhuman, S.convertkit, S.linear, D],
  },
  {
    id: 'distribution_insight',
    label: 'Finds a distribution edge built into the product',
    description: 'Designs a channel the product itself feeds: integrations/marketplaces, programmatic pages, invite loops, open source, creator/influencer engines, free tools.',
    examples: ['Zapier', 'Calendly', 'Cal AI', 'Plausible', 'Ahrefs', 'Midjourney (Discord)'],
    measurableInGame: {
      text: '≥1 product-embedded channel live (integration listing, viral loop, free tool, programmatic SEO, creator program) and ≥25% of new customers from it',
      signals: [
        { stat: 'productEmbeddedChannelsLive', op: '>=', value: 1 },
        { stat: 'shareOfNewCustomersFromEmbeddedChannel', op: '>=', value: 0.25 },
      ],
    },
    effect: {
      mechanic: 'Hidden channel–product fit variable per niche; discovering it unlocks a compounding acquisition stream with low marginal CAC.',
      magnitude: 'Organic acquisition ×1.5–5 once found; CAC ×0.3–0.6 for that stream [design]',
    },
    sources: [S.zapier, S.calendly, S.calai, S.plausible, S.ahrefs, D],
  },
  {
    id: 'unscalable_concierge',
    label: 'Does things that don\'t scale',
    description: 'Hand-onboards early customers, migrates their data, sets them up on a call, writes personal emails, visits them.',
    examples: ['Stripe', 'Airbnb', 'Superhuman', 'ConvertKit'],
    measurableInGame: {
      text: 'First 20–50 customers personally onboarded (call or done-for-you setup)',
      signals: [{ stat: 'conciergeOnboardingsFirst50', op: '>=', value: 20 }],
    },
    effect: {
      mechanic: 'Raises activation and early retention; generates testimonials and referrals; costs founder hours.',
      magnitude: 'Activation ×1.3–1.6 and early churn ×0.6–0.8 for onboarded cohort; 1–2 h per customer',
    },
    sources: [S.pgDontScale, S.superhuman, D],
  },
  {
    id: 'ride_capability_shift',
    label: 'Ships fast on new platform capabilities',
    description: 'Watches model/API/platform releases and ships a product or feature that the new capability makes possible within weeks, before the crowd.',
    examples: ['Bolt.new', 'Lovable', 'Cursor', 'TypingMind', 'HeadshotPro', 'Base44', 'Midjourney', 'Cal AI'],
    measurableInGame: {
      text: 'Ships a feature using a newly released capability ≤30 days after a LUCK_EVENTS.capability_tailwind fires',
      signals: [{ stat: 'daysFromCapabilityReleaseToShip', op: '<=', value: 30 }],
    },
    effect: {
      mechanic: 'Captures the bulk of capability_tailwind demand; late movers get little. Also raises AI-lab overlap risk if the product is a thin wrapper.',
      magnitude: 'Share of tailwind captured: ≤30 days 60–100%, 30–90 days 20–50%, >90 days 0–15% [design]',
    },
    sources: [S.bolt, S.lovable, S.cursor, S.dinh, S.stripeAI, D],
  },
  {
    id: 'retention_first',
    label: 'Fixes retention before scaling acquisition',
    description: 'Tracks cohort churn and NRR monthly; refuses to scale paid acquisition until churn is in benchmark range and NRR ≥100% (B2B).',
    examples: ['Linear', 'Superhuman', 'Tally'],
    measurableInGame: {
      text: 'Paid spend increased only while monthly logo churn ≤ model benchmark (B2C ≤8%, SMB ≤4%, ent ≤1.5%) or NRR ≥100%',
      signals: [
        { stat: 'scaledSpendWhileChurnAboveBenchmark', op: '==', value: false },
        { stat: 'cohortReviewsPerMonth', op: '>=', value: 1 },
      ],
    },
    effect: {
      mechanic: 'Avoids the leaky-bucket plateau and premature-scaling failure; compounds growth.',
      magnitude: 'Annual growth at NRR >100% ≈54% vs ≈12% at 60–80% NRR (ChartMogul, correlational)',
    },
    sources: [S.cm2023, S.startupGenome],
  },
  {
    id: 'default_alive',
    label: 'Stays default alive and frugal',
    description: 'Keeps burn low, runway ≥12–18 months, cuts fast when needed (Notion moved to Kyoto), takes little or no capital until pull is proven.',
    examples: ['Zapier', 'Mailchimp', 'Linear', 'Notion', 'Tally', 'Plausible', 'Midjourney'],
    measurableInGame: {
      text: 'Runway ≥12 months (VC ≥18 before raising) or profitable; burn multiple ≤1.5 once revenue exists',
      signals: [
        { stat: 'runwayMonths', op: '>=', value: 12 },
        { stat: 'burnMultiple', op: '<=', value: 1.5 },
      ],
    },
    effect: {
      mechanic: 'More months alive = more lottery draws (launches, luck events, capability shifts). Avoids the cash-out failure that ends 70% of VC shutdowns.',
      magnitude: 'Survival hazard ×0.4–0.7 [design]; no direct growth bonus',
    },
    sources: [S.cbi2026, S.zapier, S.notion, S.mailchimp, D],
  },
  {
    id: 'persist_with_learning',
    label: 'Persists through near-death, but changes something',
    description: 'Survives the plateau or crisis by changing ICP, positioning, channel or product based on evidence (not by doing the same thing longer).',
    examples: ['Slack', 'Notion', 'ConvertKit', 'Canva', 'Bolt.new', 'Figma', 'Tally'],
    measurableInGame: {
      text: 'During a ≥3-month MRR plateau, makes ≥1 evidence-backed change (ICP, positioning, pricing, channel or product) within 60 days',
      signals: [{ stat: 'daysPlateauWithoutEvidenceBackedChange', op: '<=', value: 60 }],
    },
    effect: {
      mechanic: 'Each evidence-backed change re-draws hidden fit/channel variables with better odds than random; doing nothing leaves the walking-dead trajectory.',
      magnitude: 'Re-draw odds of improved fit 0.3–0.5 vs 0.1–0.2 for an untested change [design]',
    },
    sources: [S.slack, S.notion, S.convertkit, S.camuffo, S.cbi2026],
  },
  {
    id: 'domain_expertise',
    label: 'Builds where they have domain experience',
    description: 'Picks a problem in an industry they worked in for years, using their network for the first customers.',
    examples: ['Calendly (sales background)', 'Linear (Uber/Airbnb/Coinbase tooling)', 'Canva (Fusion Books)', 'Superhuman (Rapportive)'],
    measurableInGame: {
      text: 'Founder background industry matches the product niche (≥3 years)',
      signals: [{ stat: 'founderIndustryYearsInNiche', op: '>=', value: 3 }],
    },
    effect: {
      mechanic: 'Better prior on true ICP pain, warmer first-customer pool, more credible to buyers and investors.',
      magnitude: 'Hidden-fit prior +; warm intros ×1.5–2; tail-outcome odds ×1.5–2 [design from Azoulay et al.]',
    },
    sources: [S.azoulay],
  },
  {
    id: 'serial_reputation',
    label: 'Leverages a prior success',
    description: 'A founder with a prior exit or success gets more customer, partner and investor commitment (part skill, part reputation).',
    examples: ['Slack (Flickr)', 'Superhuman (Rapportive)', 'Tally (prior startup)'],
    measurableInGame: {
      text: 'Founder background has a prior successful company',
      signals: [{ stat: 'founderPriorSuccess', op: '==', value: true }],
    },
    effect: {
      mechanic: 'Raises investor/customer trust and odds of success across the board; prior failure gives a small bonus.',
      magnitude: 'Success odds ×1.5–1.7 (30% vs 18%); prior failure ×1.0–1.1',
    },
    sources: [S.gompers],
  },
];

// ---------------------------------------------------------------------------------------------------------------
// 3. Failure modes. baseRate: share of failed/stalled companies where this is a material cause (overlapping; sums
//    >1), for the given path. triggeredBy: player actions/state that raise the probability.
// ---------------------------------------------------------------------------------------------------------------

export const FAILURE_MODES = [
  {
    id: 'no_market_need',
    label: 'Built something nobody needs (no PMF)',
    baseRate: { vc: 0.43, indie: [0.35, 0.5] },
    warningSigns: ['0 paying customers 90 days after launch', 'Few customer conversations', 'PMF survey "very disappointed" <25%', 'Activation <20%', 'Users say "nice" but do not pay or return'],
    triggeredBy: ['Building >3 months before first customer conversation', 'customerConversationsPerWeek <1', 'Ignoring interview evidence', 'Broad ICP', 'Feature count rising while activation flat'],
    howItEndsInGame: 'Slow: MRR stays near zero, motivation drains (burnout risk up), founder quits or pivots; VC path burns runway then cash failure.',
    sources: [S.cbi2026, S.failory, S.ihStripe],
  },
  {
    id: 'ran_out_of_cash',
    label: 'Ran out of cash (often while fundraising)',
    baseRate: { vc: 0.7, indie: [0.15, 0.3] },
    warningSigns: ['Runway <6 months with no committed round', 'Burn multiple >2', 'Starting a raise with <9 months runway', 'Bridge notes from insiders', 'Missed Series A bar 18+ months after seed'],
    triggeredBy: ['Hiring ahead of revenue', 'Raising late', 'Paid acquisition with CAC payback >24 months', 'No cut plan', 'Personal savings funding an indie business with no revenue'],
    howItEndsInGame: 'Hard stop: bank balance hits zero → wind-down, distressed acqui-hire or personal debt. Median 22 months after last raise (VC).',
    sources: [S.cbi2026, S.cartaSeedA],
  },
  {
    id: 'premature_scaling',
    label: 'Scaled before product-market fit',
    baseRate: { vc: [0.3, 0.7], indie: [0.1, 0.2] },
    warningSigns: ['Spend or headcount growing faster than retained revenue', 'Churn above benchmark while spend rises', 'Sales hires before founder-led repeatable sales'],
    triggeredBy: ['Raising a large round pre-PMF', 'Scaling paid ads with churn above benchmark', 'Hiring >2 people before $10k MRR (indie) / before repeatable sales (VC)'],
    howItEndsInGame: 'Burn spikes, CAC rises, cohorts decay; becomes ran_out_of_cash or forced layoffs (Gumroad: 75%).',
    sources: [S.startupGenome, S.gumroad, D],
  },
  {
    id: 'leaky_bucket',
    label: 'Churn eats growth (plateau)',
    baseRate: { vc: [0.15, 0.25], indie: [0.25, 0.35] },
    warningSigns: ['New MRR ≈ churned MRR for 3+ months', 'Monthly logo churn >8% B2C / >4% SMB / >1.5% ent', 'NRR <90%', 'Annual plans cancelling in month 1'],
    triggeredBy: ['No onboarding work', 'Ignoring support', 'Selling to non-ICP customers', 'Discount-led acquisition', 'Scaling spend without cohort review'],
    howItEndsInGame: 'Walking dead: years of flat MRR, founder income too low; ends in quitting, a small asset sale, or a pivot.',
    sources: [S.microconf24, S.cm2023, S.rcSosa26],
  },
  {
    id: 'no_distribution',
    label: 'Built it, nobody came (no repeatable channel)',
    baseRate: { vc: [0.15, 0.25], indie: [0.4, 0.55] },
    warningSigns: ['One launch spike then flat traffic', 'No channel producing ≥30% of new customers', 'No audience, no outbound, no SEO after 6 months'],
    triggeredBy: ['publicPostsPerWeek ≈0', 'outboundTouchesPerWeek ≈0', 'Relying on a single Product Hunt/HN launch', 'Polishing product instead of selling'],
    howItEndsInGame: 'Near-zero revenue (>54% of indie products earn $0); founder quits within 6–18 months.',
    sources: [S.ihStripe, S.phDoc, D],
  },
  {
    id: 'underpricing',
    label: 'Underpriced / unit economics never work',
    baseRate: { vc: 0.19, indie: [0.15, 0.3] },
    warningSigns: ['ARPA below what supports the founder at realistic customer counts', 'Gross margin <50% (AI inference)', 'CAC payback >24 months', 'Heavy users cost more than they pay'],
    triggeredBy: ['Prices below market median', 'Unlimited AI usage on flat plans', 'Lifetime deals', 'Paid acquisition for a <$20/mo product'],
    howItEndsInGame: 'Growth makes losses bigger; forced price increase with churn, or cash failure.',
    sources: [S.cbi2026, S.microconf24, S.bessemer],
  },
  {
    id: 'ai_commoditized',
    label: 'Thin AI layer commoditized or sherlocked',
    baseRate: { vc: [0.1, 0.2], indie: [0.1, 0.25] },
    warningSigns: ['Product = prompt + UI on one model', 'Switching cost <1 day', 'AI lab announces overlapping feature', 'Model price drops let rivals undercut'],
    triggeredBy: ['aiDependence "wrapper"', 'Horizontal positioning', 'No proprietary data, workflow or distribution'],
    howItEndsInGame: 'Sudden churn spike after ai_lab_feature_overlap or competitor price cut (Jasper 2023); pivot to vertical/enterprise or shut down.',
    relatedWorldEvents: ['ai_lab_feature_overlap', 'llm_price_cut', 'competitor_price_cut'],
    sources: [S.simpleclosure, S.jasper, S.worldDoc],
  },
  {
    id: 'bad_timing',
    label: 'Bad timing or macro (too early / too late)',
    baseRate: { vc: 0.29, indie: [0.1, 0.2] },
    warningSigns: ['Buyers say "not now"', 'Category funding collapsing', 'Required capability not yet good enough', 'Category already crowded with funded leaders'],
    triggeredBy: ['Entering a cold category heat curve', 'Ignoring enterprise budget freezes', 'Building on a capability that is not ready'],
    howItEndsInGame: 'Demand multiplier stuck below 1; survivable only if default alive until the window opens.',
    relatedWorldEvents: ['enterprise_budget_freeze', 'saas_sentiment_shift'],
    sources: [S.cbi2026, S.grossTed],
  },
  {
    id: 'cofounder_conflict',
    label: 'Co-founder conflict or departure',
    baseRate: { vc: [0.1, 0.25], indie: [0.05, 0.15] },
    warningSigns: ['Unclear roles', 'Equal split with unequal effort', 'No vesting', 'Disagreement on path (indie vs VC)'],
    triggeredBy: ['No co-founder agreement', 'No vesting/cliff', 'Skipping a trial project'],
    howItEndsInGame: 'Departure event; dead equity; speed loss; sometimes shutdown.',
    relatedWorldEvents: [],
    sources: [S.cofounderDoc],
  },
  {
    id: 'founder_burnout',
    label: 'Founder burnout / gives up',
    baseRate: { vc: [0.1, 0.2], indie: [0.3, 0.5] },
    warningSigns: ['>60 h/week for 8+ weeks', 'No progress signal for months', 'Personal savings running low', 'Health events'],
    triggeredBy: ['Sustained overwork', 'No peer support', 'Side project with no hours', 'Long plateau'],
    howItEndsInGame: 'Indie founders usually quit (business dormant) rather than go bankrupt; burnout_episode reduces hours and quality.',
    relatedWorldEvents: ['burnout_episode', 'founder_illness'],
    sources: [S.burnoutDoc, D],
  },
  {
    id: 'platform_dependency',
    label: 'Platform dependency killed the channel or product',
    baseRate: { vc: [0.03, 0.08], indie: [0.05, 0.15] },
    warningSigns: ['>50% of acquisition from one platform', 'Product depends on one API/marketplace', 'Policy changes announced'],
    triggeredBy: ['Single-channel growth (SEO only, Meta only, one app store)', 'No owned audience/email list'],
    howItEndsInGame: 'Abrupt acquisition drop or delisting (Glitch on Flash); survive if diversified.',
    relatedWorldEvents: ['google_core_update', 'meta_ad_account_restricted', 'marketplace_policy_change', 'app_store_rejection'],
    sources: [S.slack, S.worldDoc],
  },
  {
    id: 'walking_dead',
    label: 'Walking dead (alive, not growing)',
    baseRate: { vc: 0.25, indie: [0.25, 0.35] },
    warningSigns: ['Flat MRR 12+ months', 'No fundable or sellable story', 'Founder income below market salary'],
    triggeredBy: ['Persisting without changing anything', 'Avoiding hard decisions (pivot, sell, shut down)'],
    howItEndsInGame: 'Ends in a small asset sale, a quiet shutdown, or a late pivot; opportunity cost shown in end screen.',
    sources: [S.cbi2026, S.microconf24],
  },
  {
    id: 'overbuilt_before_validation',
    label: 'Overbuilt before validating (big launch flop)',
    baseRate: { vc: [0.05, 0.15], indie: [0.15, 0.25] },
    warningSigns: ['Long stealth build', 'High cost per unit (hardware, heavy AI)', 'Launch reviews poor', 'Returns/refunds exceed new sales'],
    triggeredBy: ['>6 months building without paying users', 'Large raise spent on product before demand evidence'],
    howItEndsInGame: 'One big launch, poor reception, cash gone (Humane: sold for $116M vs $750M–$1B sought).',
    sources: [S.humane, D],
  },
  {
    id: 'integrity_failure',
    label: 'Metric inflation or fraud',
    baseRate: { vc: [0.005, 0.02], indie: [0.001, 0.01] },
    warningSigns: ['Reported revenue not reconciling to bank deposits', 'Round-tripped or partner "deals"', 'Fake reviews'],
    triggeredBy: ['Player misreports metrics to investors/buyers', 'Buys fake reviews'],
    howItEndsInGame: 'Rare but catastrophic: diligence failure, lender default, legal action (Builder.ai 2025).',
    relatedWorldEvents: ['fake_review_temptation'],
    sources: [S.builderai],
  },
];

// ---------------------------------------------------------------------------------------------------------------
// 4. Luck events. baseRatePerYear is for a REFERENCE founder: launched product, ~1,000 audience, ~1 public post/week,
//    1 launch/year, 2 customer conversations/week, 2 releases/month, 20 outbound touches/week.
//    surfaceArea weights w_f apply as: multiplier = min(maxMultiplier, Π_f (1 + w_f * log2(1 + x_f / ref_f)) / Π_f (1 + w_f))
//    so the reference founder gets 1.0, zero activity gets <1, and returns diminish. All magnitudes/rates are [design]
//    unless a source says otherwise. Positive tail events are rare but real.
// ---------------------------------------------------------------------------------------------------------------

export const SURFACE_AREA_REFS = {
  publicPostsPerWeek: 1,
  audienceSize: 1000,
  launchesPerYear: 1,
  customerConversationsPerWeek: 2,
  shippedFeaturesPerMonth: 2,
  outboundTouchesPerWeek: 20,
  contentPiecesPerMonth: 2,
  mrr: 2000,
  growthRateMonthly: 0.05,
  communityAnswersPerWeek: 2,
  integrationsLive: 1,
};

export const LUCK_EVENTS = [
  // ----- positive -----
  {
    id: 'viral_post',
    label: 'A post goes viral',
    polarity: 'positive',
    baseRatePerYear: 0.4,
    models: { b2c: 1.5, smb: 1, ent: 0.5 },
    surfaceArea: { publicPostsPerWeek: 0.8, audienceSize: 0.5, shippedFeaturesPerMonth: 0.2 },
    maxMultiplier: 8,
    // landingMultByModel mirrors growth ORGANIC.social.audienceFit: a viral founder post reaches builders, not consumers.
    magnitude: { reachMultiplier: [10, 100], signupsMultiplier: [2, 10], durationDays: [2, 7], followerGain: [200, 5000], landingMultByModel: { b2c: 0.3, smb: 1, ent: 0.6 } },
    followOns: ['clone_after_viral', 'investor_inbound'],
    promptHint: 'Write the founder\'s post that blew up (specific numbers or a contrarian lesson) and 3 representative replies, including one skeptic and one potential customer.',
    sources: [S.lsa, D],
  },
  {
    id: 'hn_front_page',
    label: 'Show HN hits the front page',
    polarity: 'positive',
    baseRatePerYear: 0.1,
    perLaunchProbability: [0.05, 0.15],
    models: { b2c: 0.7, smb: 1.2, ent: 0.6 },
    surfaceArea: { launchesPerYear: 1.0, shippedFeaturesPerMonth: 0.3, communityAnswersPerWeek: 0.3 },
    maxMultiplier: 6,
    // landingMult/paidConvMult: 14–125 signups on 678–35,000 visits (≈0.4–2%) and few paid conversions [S/A], so HN
    // visitors sign up at ~half the usual landing rate and convert trial→paid at ~0.3× (calibration 2026-10-14).
    magnitude: { visits: [700, 35000], signupRate: [0.01, 0.05], durationDays: [1, 2], backlinks: [5, 40], landingMult: 0.5, paidConvMult: 0.3 },
    promptHint: 'Generate the HN thread: top comment (often critical/technical), a "we built this too" comment, and one asking about pricing or self-hosting.',
    sources: [S.hn, D],
  },
  {
    id: 'product_hunt_top3',
    label: 'Product Hunt top 3 of the day',
    polarity: 'positive',
    baseRatePerYear: 0.04,
    perLaunchProbability: [0.02, 0.05],
    models: { b2c: 1.2, smb: 1, ent: 0.3 },
    surfaceArea: { launchesPerYear: 1.0, audienceSize: 0.8, publicPostsPerWeek: 0.3 },
    maxMultiplier: 5,
    // paidConvMult: PH signups pay at 0.25–2% (growth ORGANIC.ph.paidConv) vs ~40% for a normal trial → ×0.03.
    magnitude: { visits: [1000, 8000], signupsMultiplier: [3, 8], durationDays: [1, 3], paidConversion: 'low', landingMult: 0.7, paidConvMult: 0.03 },
    promptHint: 'Show the PH badge, comment thread and the flood of upvote-selling DMs; most visitors do not convert.',
    sources: [S.phDoc, D],
  },
  {
    id: 'creator_mention',
    label: 'A creator or newsletter mentions you (unpaid)',
    polarity: 'positive',
    baseRatePerYear: 0.2,
    models: { b2c: 1.5, smb: 1, ent: 0.4 },
    surfaceArea: { audienceSize: 0.6, publicPostsPerWeek: 0.4, shippedFeaturesPerMonth: 0.3, outboundTouchesPerWeek: 0.2 },
    maxMultiplier: 6,
    magnitude: { signupsMultiplier: [3, 20], durationDays: [5, 14], longTailLift: [1.02, 1.1] },
    promptHint: 'Name a plausible (fictional) creator in the niche, write their 2-sentence mention and its tone; it may include a criticism.',
    sources: [S.calai, D],
  },
  {
    id: 'press_feature',
    label: 'Press feature in a relevant publication',
    polarity: 'positive',
    baseRatePerYear: 0.1,
    models: { b2c: 1.2, smb: 0.8, ent: 1 },
    surfaceArea: { outboundTouchesPerWeek: 0.4, growthRateMonthly: 0.5, audienceSize: 0.3 },
    maxMultiplier: 5,
    // General readers: fewer sign up and fewer buy than search/referral visitors [design].
    magnitude: { visits: [500, 20000], signupsMultiplier: [1.5, 5], durationDays: [2, 5], credibilityBoost: 'investor & enterprise trust +', landingMult: 0.7, paidConvMult: 0.5 },
    promptHint: 'Write the headline and the one paragraph about the company; journalists may get details wrong.',
    sources: [S.pressDoc, D],
  },
  {
    id: 'whale_inbound',
    label: 'A whale customer reaches out',
    polarity: 'positive',
    baseRatePerYear: 0.1,
    models: { b2c: 0, smb: 1, ent: 1.5 },
    surfaceArea: { contentPiecesPerMonth: 0.5, outboundTouchesPerWeek: 0.5, customerConversationsPerWeek: 0.3, integrationsLive: 0.3, mrr: 0.3 },
    maxMultiplier: 6,
    magnitude: { acvMultipleOfMedian: [5, 50], salesCycleDays: [30, 180], requirements: ['security questionnaire', 'SSO', 'custom terms'], concentrationRiskAbove: 0.3 },
    followOns: ['whale_churn'],
    promptHint: 'Create the inbound email from a named role at a larger company with a specific use case and two demanding asks.',
    sources: [D, S.worldDoc],
  },
  {
    id: 'acquisition_interest',
    label: 'Inbound acquisition interest',
    polarity: 'positive',
    baseRatePerYear: 0.15,
    minMrr: 5000,
    models: { b2c: 1, smb: 1.2, ent: 1 },
    surfaceArea: { mrr: 0.8, growthRateMonthly: 0.6, audienceSize: 0.4, integrationsLive: 0.3 },
    maxMultiplier: 6,
    magnitude: {
      microSaasRevenueMultiple: [2, 4],
      sdeMultiple: [4, 6],
      strategicRevenueMultiple: [6, 20],
      pStrategic: [0.02, 0.08],
      pCloses: [0.1, 0.3],
      diligenceWeeks: [4, 12],
    },
    promptHint: 'Write the first email from an acquirer type (micro-PE buyer, competitor, adjacent platform, corp dev). Corp dev may just be fishing; make the buyer type ambiguous at first.',
    sources: [S.exitDoc, S.base44, D],
  },
  {
    id: 'capability_tailwind',
    label: 'New model/platform capability makes your product possible or much better',
    polarity: 'positive',
    baseRatePerYear: 1.5,
    conditions: { aiDependence: { none: 0.2, feature: 0.8, core: 1.5, wrapper: 1.5 } },
    models: { b2c: 1, smb: 1, ent: 0.8 },
    surfaceArea: { shippedFeaturesPerMonth: 0.6, customerConversationsPerWeek: 0.2, publicPostsPerWeek: 0.2 },
    maxMultiplier: 3,
    magnitude: { categoryDemandMultiplier: [2, 10], durationMonths: [3, 12], captureByShipLatency: { le30d: [0.6, 1], le90d: [0.2, 0.5], gt90d: [0, 0.15] } },
    relatedWorldEvents: ['llm_price_cut', 'ai_lab_feature_overlap'],
    promptHint: 'Announce a (fictional) model release with one concrete new capability relevant to the player\'s niche; competitors notice too.',
    sources: [S.bolt, S.lovable, S.cursor, S.stripeAI, D],
  },
  {
    id: 'investor_inbound',
    label: 'VC or angel reaches out unprompted',
    polarity: 'positive',
    baseRatePerYear: 0.5,
    models: { b2c: 1, smb: 1, ent: 1.2 },
    paths: { indie: 0.7, vc: 1.3 },
    surfaceArea: { growthRateMonthly: 0.8, publicPostsPerWeek: 0.4, audienceSize: 0.4, mrr: 0.4 },
    maxMultiplier: 6,
    magnitude: { meetingsOffered: [1, 3], pTermSheetIfGoodMetrics: [0.05, 0.2] },
    promptHint: 'Mostly associates "keeping in touch"; occasionally a partner with a real thesis. See inbound-archetypes.js.',
    sources: ['docs/research/inbound-network-calendar.md', D],
  },
  {
    id: 'marketplace_feature',
    label: 'Featured by a marketplace or platform',
    polarity: 'positive',
    baseRatePerYear: 0.1,
    models: { b2c: 1, smb: 1.2, ent: 0.5 },
    surfaceArea: { integrationsLive: 1.0, shippedFeaturesPerMonth: 0.3, mrr: 0.2 },
    maxMultiplier: 5,
    magnitude: { installsMultiplier: [2, 6], durationDays: [7, 30] },
    promptHint: 'App store/marketplace editorial feature or "staff pick" with a short blurb.',
    sources: ['docs/research/channels-partnerships-pricing.md', D],
  },
  {
    id: 'category_heat',
    label: 'Your category gets hot',
    polarity: 'positive',
    baseRatePerYear: 0.15,
    models: { b2c: 1, smb: 1, ent: 1 },
    surfaceArea: { customerConversationsPerWeek: 0.2, publicPostsPerWeek: 0.2 },
    maxMultiplier: 1.5,
    magnitude: { demandMultiplier: [1.3, 2], investorInterestMultiplier: [1.5, 3], newEntrantsMultiplier: [2, 4], durationMonths: [6, 24] },
    relatedWorldEvents: ['competitor_new_entrant', 'competitor_raise'],
    promptHint: 'News cycle about the category; mention that competitors and investors pile in.',
    sources: [S.grossTed, S.cm2024, D],
  },

  // ----- negative (not already in world.js) -----
  {
    id: 'whale_churn',
    label: 'Your biggest customer churns',
    polarity: 'negative',
    baseRatePerYear: 0.12,
    conditions: { requiresCustomerConcentrationAbove: 0.15 },
    models: { b2c: 0, smb: 1, ent: 1.2 },
    surfaceArea: { customerConversationsPerWeek: -0.3 },
    maxMultiplier: 2,
    magnitude: { mrrLossShare: 'that customer\'s share', noticeDays: [0, 90], causes: ['champion left', 'budget cut', 'acquired', 'built in-house', 'competitor'] },
    promptHint: 'Write the cancellation email; the stated reason may differ from the real one (champion left).',
    sources: [D, S.worldDoc],
  },
  {
    id: 'payment_reserve',
    label: 'Payment processor places a reserve or holds payouts',
    polarity: 'negative',
    baseRatePerYear: 0.05,
    conditions: { triggers: ['sudden volume spike', 'dispute rate >0.75%', 'large prepaid annual plans', 'risky category'] },
    models: { b2c: 1.5, smb: 1, ent: 0.5 },
    surfaceArea: {},
    maxMultiplier: 1,
    magnitude: { reserveShare: [0.1, 0.25], holdDays: [30, 120] },
    promptHint: 'Processor email that is polite but vague; appeal takes days.',
    sources: [S.financeDoc, D],
  },
  {
    id: 'clone_after_viral',
    label: 'Clones appear after your viral moment',
    polarity: 'negative',
    baseRatePerYear: 0.1,
    conditions: { afterEvents: ['viral_post', 'product_hunt_top3', 'hn_front_page'], probabilityAfterEvent: [0.3, 0.6] },
    models: { b2c: 1.5, smb: 1, ent: 0.3 },
    surfaceArea: { publicPostsPerWeek: 0.2 },
    maxMultiplier: 2,
    magnitude: { newCompetitors: [1, 5], conversionMultiplier: [0.85, 0.95], durationMonths: [3, 12] },
    relatedWorldEvents: ['competitor_new_entrant'],
    promptHint: 'Show a near-identical landing page launched by someone else, cheaper.',
    sources: [D],
  },
  {
    id: 'term_sheet_pulled',
    label: 'Lead investor pulls out mid-raise',
    polarity: 'negative',
    baseRatePerYear: 0.05,
    paths: { indie: 0, vc: 1 },
    conditions: { requiresActiveRaise: true },
    models: { b2c: 1, smb: 1, ent: 1 },
    surfaceArea: {},
    maxMultiplier: 1,
    magnitude: { raiseDelayMonths: [1, 4], otherInvestorsDropProbability: [0.3, 0.6] },
    promptHint: 'Partner calls to say IC passed (macro, metrics dip or diligence finding).',
    sources: [S.cbi2026, D],
  },
  {
    id: 'acquisition_falls_through',
    label: 'Acquisition falls through in diligence',
    polarity: 'negative',
    baseRatePerYear: 0,
    conditions: { afterEvents: ['acquisition_interest'], probabilityAfterLoi: [0.3, 0.5] },
    models: { b2c: 1, smb: 1, ent: 1 },
    surfaceArea: {},
    maxMultiplier: 1,
    magnitude: { monthsLost: [1, 4], breakFeeProbability: [0, 0.02], growthDistractionMultiplier: [0.8, 0.95] },
    promptHint: 'Buyer finds messy books, customer concentration or owner dependence; or regulators block (Adobe–Figma, rare big case).',
    sources: [S.figma, S.exitDoc, D],
  },
  {
    id: 'key_person_leaves',
    label: 'Key contractor or early employee leaves',
    polarity: 'negative',
    baseRatePerYear: 0.15,
    conditions: { requiresTeamSizeAtLeast: 1 },
    models: { b2c: 1, smb: 1, ent: 1 },
    surfaceArea: {},
    maxMultiplier: 1,
    magnitude: { velocityMultiplier: [0.6, 0.85], durationWeeks: [4, 12], knowledgeLoss: 'docs reduce impact' },
    promptHint: 'Two weeks\' notice with a reason (offer elsewhere, burnout, disagreement).',
    sources: ['docs/research/hiring-and-performance.md', D],
  },
];

// Effective annual rate for a luck event given an activity snapshot (keys of SURFACE_AREA_REFS).
// Negative weights reduce odds as activity rises (e.g. customer contact lowers whale churn).
export function luckRate(event, activity = {}, { model, path } = {}) {
  const weights = event.surfaceArea || {};
  let num = 1;
  let den = 1;
  for (const [k, w] of Object.entries(weights)) {
    const ref = SURFACE_AREA_REFS[k] || 1;
    const x = Math.max(0, Number(activity[k]) || 0);
    num *= Math.max(0.05, 1 + w * Math.log2(1 + x / ref));
    den *= Math.max(0.05, 1 + w);
  }
  const mult = Math.min(event.maxMultiplier ?? 5, num / den);
  const modelMult = model && event.models ? (event.models[model] ?? 1) : 1;
  const pathMult = path && event.paths ? (event.paths[path] ?? 1) : 1;
  return event.baseRatePerYear * mult * modelMult * pathMult;
}
