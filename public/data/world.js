// World events and operating benchmarks for the founder simulator: competitors, platforms, AI labs, macro,
// security, ops, life and reputation, plus support / reviews / analytics / ops / investor relations /
// wellbeing / co-founder parameters.
// Research basis: docs/research/world-ops-support-life.md (compiled 2026-10-14).
//
// Conventions
// - baseRatePerYear: expected occurrences per year for the REFERENCE company: launched, B2B SMB, AI as a
//   feature (not the core), one founder, path-neutral, ~100 paying customers. Most rates are [design]
//   game estimates anchored on the evidence in `sources`. They are not measured statistics unless the
//   source says so.
// - Effective rate = baseRatePerYear
//     * conditions.model[model] * conditions.stage[stage] * conditions.path[path]
//     * conditions.aiDependence[aiDependence]          // none | feature | core | wrapper
//     * product of conditions.exposure[k] for every exposure flag k that is true for the player
//   If conditions.requires lists flags, the event cannot fire unless ALL are true for the player
//   (e.g. 'usesSEO', 'runsMetaAds', 'hasIOSApp', 'selfServeCheckout', 'usesLLMApi', 'hasInvestors').
//   Missing keys count as 1. Sample with Poisson(rate * days / 365). Never fire randomly outside these rules.
// - effects: `text` is a plain description; the other keys are suggested numeric effects. Multipliers
//   apply for durationDays unless stated. Ranges are [lo, hi]; draw within them using the player's state
//   (e.g. better docs → lower end of the support spike).
// - playerResponses: options the game offers. hours = founder hours; cost = USD cash; effectHints are
//   suggested numeric modifications to the event's effects if chosen.
// - promptHint: instruction for an LLM to write the concrete news item / email / notification about the
//   player's ACTUAL niche, product and competitors. The LLM must not invent statistics.
// - Source tags: [P] primary, [S] secondary summary, [V] vendor, [Q] qualitative, [design] game estimate.

const S = {
  design: '[design] game estimate',
  g2_2025: 'G2 Fall/Winter 2025 report pages; AI categories +18–22 products/quarter [V]',
  pricingSaaS: 'PricingSaaS 500 via Growth Unhinged 2025: 126 pricing + 213 packaging changes [S]',
  jasper: 'Maginative 2023: Jasper valuation −20%, forecast −30%, layoffs Jul 2023 [S]',
  recordMode: 'OpenAI Record mode + connectors 2025-06-04 (TechRepublic, ITPro) [S]',
  atlas: 'OpenAI "Introducing ChatGPT Atlas" 2025-10-21 [P]',
  agentKit: 'OpenAI DevDay 2025-10-06 AgentKit/Agent Builder commentary [Q]',
  cowork: 'Fortune 2026-02-06; Cyber Daily: Claude Cowork plugins → software index −~8% [S]',
  o3cut: 'OpenAI o3 price −80% on 2025-06-10 (VentureBeat) [S]',
  epoch: 'Epoch AI LLM inference price trends 2025-03: 9x–900x/yr per capability level [P]',
  deprec: 'Anthropic/OpenAI/Google deprecation pages and trackers, 2025–2026 [P/S]',
  geminiFree: 'Gemini API free-tier cut 2025-12-06/07 (agentdeals digest, dev.to) [S]',
  coreUpdates: 'SEJ + trackers: ~3.3 Google core updates/yr 2022–2025; Mar & May 2026 [S]',
  aio: 'Ahrefs 2025-12 / Seer 2025-11 AI Overviews CTR studies (see marketing-and-ads.md) [V/S]',
  metaBans: 'NYT 2025 via aiweekly; Porter Metrics / ads practitioners 2026 on agent-driven disables [S/Q]',
  appleReview: 'Apple App Store Transparency Report 2024/2025 via iClarified, Surfshark [S]',
  epic: 'Epic v. Apple order 2025-04-30 (Adapty, Courthouse News) [S]',
  atlassian: 'Atlassian Server app end of sale/support 2024-02-15 [P]',
  fed: 'FOMC 2026-06-17 hold at 3.50–3.75% (Advisor Perspectives) [S]',
  cio2025: 'Inside Software CIO FY26 survey 2025-11 [Q]; CloudEagle 2023 cuts 10–30% [V]',
  stripeCT: 'Stripe card-testing newsroom (2022 peak 20M/day) and Radar blog [P]',
  redditRadar: 'r/stripe 2024: 12,590 screened attempts, ~$11k Radar bill [Q]',
  gitguardian: 'GitGuardian State of Secrets Sprawl 2025: 23.8M leaked, 70% of 2022 leaks valid [V]',
  dbir: 'Verizon DBIR 2025: ransomware in 88% of SMB breaches [P]',
  gdpr: 'GDPR Art. 33/34: 72 h regulator notice [P]; US state laws 30–60 days typical [S]',
  outages2025: 'AWS us-east-1 2025-10-19/20; Cloudflare 2025-11-18 (Tom\'s Guide, SoftwareSeni) [S]',
  dora: 'DORA 2024 via Flagsmith: elite recover <1 h (~19%) [S]',
  uptime: 'Uptime Institute Annual Outage Analysis 2025 [P/S]',
  billShock: 'Appwrite 2025-01 (Firebase ~$70k); GCP spend caps docs; Cursor 2025-06 [Q/P/S]',
  sifted: 'Sifted founders mental health 2025-02, n=138 [S]',
  mars: 'MaRS 2025 founder mental health survey [S]',
  bii: 'BII startup wellness survey 2026-07, n=50 [S]',
  freeman: 'Freeman et al. 2019 Small Business Economics, n=242 [P, recalled]',
  lonely: 'Lonely Entrepreneur Founder Reports 2025, n=227 [V]',
  sleep: 'Penn/Ottawa sleep-loss risk study (n=56); Salfi et al. 2020 (n=74) [P/S]',
  cdcFlu: 'CDC flu burden: ~8% per season (3–11%) via secondary [S]',
  acs: 'Census ACS 2024 mover rate 11.8% [S]',
  aarp: 'AARP/NAC Caregiving in the US 2025-07-24: 63M (24% of adults) [P]',
  ftc: 'FTC final rule on fake reviews, announced 2024-08-14, effective 2024-10-21 [P]',
  trustpilot: 'Trustpilot Trust Report 2025: 4.5M fakes removed = 7.4% (2024) [V]',
  spiegel: 'Spiegel Research Center 2017 (5 reviews ≈ 4x); PowerReviews/Spiegel 2015 peak 4.2–4.5★ [P]',
  npDigital: 'NP Digital 2024-04 (49 cos): 5★ 1.00, 4★ 0.83, 3★ 0.57 [V]',
  focusDigital: 'Focus Digital: review request 10–15% email, 30–45% in person (services) [V]',
  capterra: 'Capterra 2023 SMB survey (52% reviews influence); 2025 Tech Trends (n=3,500) [V]',
  g2buyer: 'G2 Buyer Behavior 2025 (~1,100) and Answer Economy 2026 (1,076): 51% start in AI chatbots [V]',
  appleRating: 'Apple SKStoreReviewController: max 3 prompts per user per 365 days [P]',
  ticketsBlog: 'Fullview/Callin blogs: B2B 0.2–0.5 tickets/customer/month; Zendesk CX Trends 2025 via blog [V, unverified]',
  freshworks: 'Freshworks CS Benchmark 2025 via thisandthat.chat: software median FRT ~47 min [V]',
  superoffice: 'SuperOffice benchmark (1,000 cos): email FRT avg 12h10m [V]',
  timetoreply: 'timetoreply via cosupport.ai: 71% vs 48% retention (<1h vs 24h), confounded [V]',
  fin: 'Intercom Fin 67% (2025) → 76% (2026-06) vendor; independent SMB test 38%; case studies 42–50% [V/Q]',
  intercom2026: 'Intercom Customer Service Transformation Report 2026-01-28: 82% invest, 10% mature [V]',
  gartnerCS: 'Gartner 2025-03-05: agentic AI to resolve 80% of common issues by 2029 [P, prediction]',
  survicate: 'Survicate NPS benchmarks 2025: B2B 38, B2C 49, software 30 [V]',
  userpilot: 'Userpilot SaaS Product Metrics Benchmark (2024/2025): activation 37.5%, TTV 1d12h [V]',
  amplitude: 'Amplitude 2025 Product Benchmark Report (2,600+ cos) [V]',
  pendo: 'Pendo 2019 Feature Adoption Report: 80% features rarely/never used [V, old]',
  visible: 'Visible.vc investor update guidance: monthly pre-seed–A; 57 recipients avg [V]',
  boards: 'LSVP Lighthouse; Causo seed board guides; TechCrunch board composition [Q]',
  fast: 'Founder Institute FAST via Allied/GrowthMentor: 0.25–1%, ~2y vesting [Q]',
  cartaSplit: 'Carta: 2-founder equal split 45.9% (2024), 44–46% (2025), median 51/49 [S]',
  cartaDepart: 'Carta 2024-12 (13,133 founders): ~25% of VC-backed lose a cofounder by yr 4; 2026-03 update [S]',
  wasserman: 'Wasserman, The Founder\'s Dilemmas: 65% of failures = people problems [S]',
  ycMatch: 'YC Co-Founder Matching blog 2021: 25% invite acceptance, 33k matches in ~3 months [P]',
  cofounderTime: 'Practitioner guides (Onlook, Launchrock): 3–6 months search; 1–3 month trial [Q]',
  vestReset: 'CMS, Holloway, Entrepreneur: vesting reset credit 10–25% [S]',
  secQ: 'Wolfia/Tribble guides: CAIQ ~261 q, SIG Lite 150–200; 20–40 h first time [V]',
  renewals: 'CostBench deal data (Gainsight/Vitally) 15–20% discounts, 5–10% uplifts; SaaStr 2025 [V/S]',
  eaa: 'European Accessibility Act Directive 2019/882, applies 2025-06-28; microenterprise exemption [S]',
};

export const WORLD_CONDITION_KEYS = {
  model: ['b2c', 'smb', 'ent'],
  stage: ['idea', 'launched', 'traction', 'funded'],
  path: ['indie', 'vc'],
  aiDependence: ['none', 'feature', 'core', 'wrapper'],
  flags: ['usesSEO', 'runsMetaAds', 'hasIOSApp', 'hasAndroidApp', 'selfServeCheckout', 'usesLLMApi', 'hasInvestors',
    'marketplaceDependent', 'publicRepo', 'secretScanning', 'spendCaps', 'statusPage', 'adminMFA', 'testedBackups',
    'horizontalProduct', 'verticalProduct', 'proprietaryData', 'annualContracts', 'usageBilling', 'hasCofounder',
    'usesAdAutomationAgent', 'verifiedBusiness', 'captchaAndRateLimits', 'automatedTests', 'stagingEnv', 'slowSupport',
    'recentOutage', 'reviews20Recent', 'lowEnergy', 'hasYoungKids', 'age45plus', 'renter', 'hoursOver60', 'noPeerSupport',
    'therapyOrCoach'],
};

export const WORLD_EVENTS = [
  // ---------------------------------------------------------------- competitor
  {
    id: 'competitor_new_entrant',
    label: 'A new direct competitor launches',
    category: 'competitor',
    baseRatePerYear: 2,
    conditions: { model: { b2c: 2, smb: 1, ent: 0.5 }, stage: { idea: 1, launched: 1, traction: 1.2, funded: 1.3 }, aiDependence: { none: 0.6, feature: 1, core: 1.6, wrapper: 2.5 }, exposure: { horizontalProduct: 1.5, verticalProduct: 0.6 } },
    effects: { text: 'A look-alike product launches (Product Hunt, X, a YC batch). Buyers start comparing. Early on the effect is small; it grows if they execute.', conversionMult: [0.93, 0.99], organicShareMult: [0.92, 0.98], durationDays: 180, investorQuestion: 'why you vs them' },
    playerResponses: [
      { id: 'ignore', label: 'Note it and keep building', hours: 0.5, cost: 0, outcome: 'No change. Most new entrants fade within a year.', effectHints: { conversionMult: 'keep' } },
      { id: 'teardown', label: 'Sign up, do a teardown, update positioning and a comparison page', hours: 6, cost: 0, outcome: 'You find 1–2 real differences and say them clearly.', effectHints: { conversionMult: '+0.03', seoPage: 'vs-page' } },
      { id: 'niche_down', label: 'Double down on the segment they ignore', hours: 10, cost: 0, outcome: 'Narrower ICP, sharper messaging; some broad leads lost, conversion in core segment up.', effectHints: { icpFocus: '+1', conversionMult: '+0.05 core / -0.05 others' } },
    ],
    promptHint: 'Write a short launch post (Product Hunt / X style) for a NEW competitor in the player\'s exact niche. Give it a plausible made-up name that is not a real company, one headline feature that overlaps the player\'s core value, one weakness a careful reader would notice, and a price close to the player\'s. No statistics.',
    sources: [S.g2_2025, S.design],
  },
  {
    id: 'competitor_raise',
    label: 'A competitor announces a funding round',
    category: 'competitor',
    baseRatePerYear: 0.8,
    conditions: { model: { b2c: 0.8, smb: 1, ent: 1.5 }, stage: { idea: 0.5, launched: 1, traction: 1.3, funded: 1.5 }, path: { indie: 0.9, vc: 1.2 }, aiDependence: { none: 0.7, feature: 1, core: 1.5, wrapper: 1.5 } },
    effects: { text: 'Rival raises (seed–Series A). Expect more ads on shared keywords, more outbound to your prospects, and investor questions. Also validates the category.', paidCpcMult: [1.1, 1.25], b2bInboundMult: [1.0, 1.1], investorConcern: 0.15, durationDays: 120 },
    playerResponses: [
      { id: 'ignore', label: 'Stay the course', hours: 0, cost: 0, outcome: 'Paid channels get pricier for a few months.', effectHints: {} },
      { id: 'narrative', label: 'Use it in your own investor narrative ("category is heating up; we win on X")', hours: 2, cost: 0, outcome: 'Investors in an active raise read it as validation if your traction is real.', effectHints: { investorConcern: -0.1 } },
      { id: 'shift_channel', label: 'Pull spend from contested keywords into owned channels', hours: 4, cost: 0, outcome: 'Lower paid volume, stable CAC.', effectHints: { paidCpcMult: 1.0, paidVolumeMult: 0.8 } },
    ],
    promptHint: 'Write a TechCrunch-style headline and 3-sentence blurb announcing that a competitor in the player\'s niche raised a seed or Series A. Use a made-up company and a plausible round size for its stage (seed $2–6M, A $10–25M in 2026). Mention one investor TYPE (not a real firm name). Keep it factual-sounding but generic.',
    sources: [S.design],
  },
  {
    id: 'competitor_price_cut',
    label: 'A competitor cuts price or launches a free tier',
    category: 'competitor',
    baseRatePerYear: 0.6,
    conditions: { model: { b2c: 1.5, smb: 1.2, ent: 0.5 }, stage: { idea: 0.3, launched: 1, traction: 1.2, funded: 1.2 }, aiDependence: { none: 0.8, feature: 1, core: 1.4, wrapper: 1.8 } },
    effects: { text: 'Price-sensitive prospects ask for a match; some trials go to the free tier. Existing customers rarely churn over it unless switching is trivial.', conversionMult: [0.88, 0.96], discountRequests: [0.1, 0.25], churnMult: [1.0, 1.08], durationDays: 120 },
    playerResponses: [
      { id: 'hold', label: 'Hold price, sharpen value messaging', hours: 3, cost: 0, outcome: 'Lose some price shoppers; keep margin.', effectHints: { conversionMult: '+0.02' } },
      { id: 'match', label: 'Match the cut', hours: 2, cost: 0, outcome: 'Conversion recovers; ARPA drops for all new customers (and existing if you reprice).', effectHints: { conversionMult: 1.0, arpaMult: [0.8, 0.9] } },
      { id: 'free_tier', label: 'Launch a limited free plan', hours: 20, cost: 0, outcome: 'More signups, more support load, lower paid conversion %, more total paid if activation is good.', effectHints: { signupMult: 1.6, paidConversionMult: 0.6, ticketsMult: 1.3 } },
    ],
    promptHint: 'Write the competitor\'s pricing-change announcement email (to its own list) for the player\'s niche: what changed, the new price, and a hook. Plausible, not exaggerated. No real company names.',
    sources: [S.pricingSaaS, S.design],
  },
  {
    id: 'competitor_feature_copy',
    label: 'A competitor ships your signature feature',
    category: 'competitor',
    baseRatePerYear: 0.7,
    conditions: { stage: { idea: 0, launched: 0.8, traction: 1.3, funded: 1.3 }, aiDependence: { none: 0.8, feature: 1, core: 1.3, wrapper: 1.6 }, exposure: { proprietaryData: 0.6 } },
    effects: { text: 'Your differentiator becomes table stakes in comparisons.', conversionMult: [0.94, 0.98], durationDays: 180 },
    playerResponses: [
      { id: 'next', label: 'Ship the next differentiator from customer interviews', hours: 25, cost: 0, outcome: 'If grounded in evidence, you regain an edge in 1–2 months.', effectHints: { conversionMult: 1.0 } },
      { id: 'depth', label: 'Go deeper on integrations/workflow they cannot copy quickly', hours: 30, cost: 0, outcome: 'Lower churn, slower but durable edge.', effectHints: { churnMult: 0.95 } },
    ],
    promptHint: 'Write a competitor changelog entry announcing a feature that closely mirrors the player\'s signature feature. Use the competitor names already in the game state.',
    sources: [S.design],
  },
  {
    id: 'competitor_exit',
    label: 'A competitor is acquired or shuts down',
    category: 'competitor',
    baseRatePerYear: 0.5,
    conditions: { model: { b2c: 1.2, smb: 1, ent: 0.8 }, stage: { idea: 0.5, launched: 1, traction: 1, funded: 1 } },
    effects: { text: 'Their customers look for alternatives (shutdown) or fear price hikes (acquisition).', inboundLeadsBurst: [5, 60], conversionMult: [1.05, 1.15], durationDays: 60 },
    playerResponses: [
      { id: 'migration_offer', label: 'Publish a migration guide + importer + discount', hours: 16, cost: 0, outcome: 'Capture a share of displaced customers.', effectHints: { inboundLeadsBurst: '×1.5' } },
      { id: 'ignore', label: 'Do nothing', hours: 0, cost: 0, outcome: 'Some customers find you anyway.', effectHints: {} },
    ],
    promptHint: 'Write a short news item or customer email from a competitor in the player\'s niche announcing a sunset (with a date ~60–90 days out) or an acquisition by a larger platform. No real company names.',
    sources: [S.design],
  },

  // ---------------------------------------------------------------- ai_lab
  {
    id: 'ai_lab_feature_overlap',
    label: 'An AI lab ships a feature that overlaps your product',
    category: 'ai_lab',
    baseRatePerYear: 0.3,
    conditions: { model: { b2c: 1.6, smb: 1.2, ent: 0.6 }, aiDependence: { none: 0.4, feature: 1, core: 2, wrapper: 3 }, exposure: { horizontalProduct: 2, verticalProduct: 0.4, proprietaryData: 0.6 } },
    effects: { text: 'A free or bundled capability in ChatGPT/Claude/Gemini now does a chunk of what you sell (cf. Record mode 2025-06, Atlas 2025-10, Cowork plugins 2026-02). Self-serve signups and B2C retention take the biggest hit.', signupMult: [0.6, 0.9], churnMult: [1.1, 1.6], investorConcern: 0.3, durationDays: 365 },
    playerResponses: [
      { id: 'reposition', label: 'Reposition on workflow, data and integrations the lab will not build', hours: 20, cost: 0, outcome: 'Partially recovers within a quarter if real depth exists.', effectHints: { signupMult: '+0.1', churnMult: '-0.1' } },
      { id: 'build_on_it', label: 'Integrate the lab\'s feature (MCP/app) and sell the layer above it', hours: 30, cost: 0, outcome: 'Turns a threat into distribution if the platform has an app directory.', effectHints: { newChannel: 'ai_app_directory' } },
      { id: 'pivot_segment', label: 'Move to a vertical / regulated segment', hours: 60, cost: 0, outcome: 'Slower, but out of the lab\'s path.', effectHints: { aiDependence: 'core→feature-like risk', icpReset: true } },
    ],
    promptHint: 'Write a realistic product announcement (blog post headline + 4 bullets) from a major AI lab (OpenAI, Anthropic or Google) launching a capability that overlaps the player\'s product. It must be plausible for late 2026 and must NOT claim to be a real past announcement. Then write one line from a tech newsletter speculating which startups are affected (describe the category, do not name real startups).',
    sources: [S.jasper, S.recordMode, S.atlas, S.agentKit, S.cowork, S.design],
  },
  {
    id: 'llm_price_cut',
    label: 'Your LLM provider cuts prices or ships a cheaper equivalent model',
    category: 'ai_lab',
    baseRatePerYear: 2.5,
    conditions: { requires: ['usesLLMApi'], aiDependence: { none: 0, feature: 1, core: 1, wrapper: 1 } },
    effects: { text: 'Same quality for less (cf. o3 −80% on 2025-06-10). Savings apply only after you migrate and re-test.', inferenceCostMult: [0.3, 0.8], requiresMigrationHours: [2, 12], durationDays: 9999 },
    playerResponses: [
      { id: 'migrate', label: 'Run your eval set and switch', hours: 6, cost: 0, outcome: 'Gross margin up; small regression risk.', effectHints: { regressionRisk: 0.1 } },
      { id: 'pass_on', label: 'Switch and cut your own price / raise usage limits', hours: 8, cost: 0, outcome: 'Conversion up, margin flat.', effectHints: { conversionMult: 1.05 } },
      { id: 'ignore', label: 'Do nothing', hours: 0, cost: 0, outcome: 'No savings.', effectHints: { inferenceCostMult: 1 } },
    ],
    promptHint: 'Write the provider\'s changelog/email announcing a price cut or a cheaper model of similar quality. Use generic model naming (e.g. "our new mid-tier model") unless the game already tracks a real model name. Include old vs new $ per million tokens consistent with game state.',
    sources: [S.o3cut, S.epoch],
  },
  {
    id: 'llm_model_deprecation',
    label: 'A model you depend on is deprecated',
    category: 'ai_lab',
    baseRatePerYear: 1.2,
    conditions: { requires: ['usesLLMApi'], aiDependence: { none: 0, feature: 0.8, core: 1.2, wrapper: 1.2 } },
    effects: { text: 'Retirement date announced (≥60 days to ~6 months for stable models; ~2 weeks for previews). The replacement behaves differently.', noticeDays: [14, 180], migrationHours: [8, 30], qualityRiskIfIgnored: 1, durationDays: 180 },
    playerResponses: [
      { id: 'migrate_now', label: 'Build an eval set and migrate early', hours: 16, cost: 0, outcome: 'Smooth cutover; maybe cheaper.', effectHints: { inferenceCostMult: [0.7, 1.1] } },
      { id: 'abstract', label: 'Add a model-routing layer for multiple providers', hours: 30, cost: 0, outcome: 'Future migrations take ~1/3 the time; can fail over during outages.', effectHints: { futureMigrationHoursMult: 0.35, providerOutageImpactMult: 0.4 } },
      { id: 'wait', label: 'Wait until the deadline', hours: 0, cost: 0, outcome: 'Rushed migration; 20–40% chance of a visible quality regression.', effectHints: { regressionRisk: 0.3 } },
    ],
    promptHint: 'Write the deprecation email from the player\'s LLM provider: model id style string, retirement date (consistent with noticeDays from today in-game), recommended replacement, link text to migration guide. Dry, official tone.',
    sources: [S.deprec, S.geminiFree],
  },
  {
    id: 'llm_free_tier_or_limit_cut',
    label: 'Provider cuts free tier or rate limits',
    category: 'ai_lab',
    baseRatePerYear: 0.4,
    conditions: { requires: ['usesLLMApi'], stage: { idea: 1.5, launched: 1, traction: 0.6, funded: 0.4 } },
    effects: { text: 'Requests start failing with 429s (cf. Gemini free tier, Dec 2025). Production apps on free quotas break.', errorRate: [0.05, 0.5], durationDays: 7, inferenceCostIncreaseUSDPerMonth: [20, 500] },
    playerResponses: [
      { id: 'pay', label: 'Move to a paid tier', hours: 1, cost: 50, outcome: 'Fixed immediately; new monthly cost.', effectHints: { errorRate: 0 } },
      { id: 'switch', label: 'Switch provider', hours: 8, cost: 0, outcome: 'Fixed in a day; quality drift risk.', effectHints: { regressionRisk: 0.15 } },
    ],
    promptHint: 'Write a terse developer-forum post or provider notice about reduced free-tier limits, plus one angry user support ticket the player receives as a result.',
    sources: [S.geminiFree],
  },
  {
    id: 'llm_provider_outage',
    label: 'LLM provider outage',
    category: 'ai_lab',
    baseRatePerYear: 4,
    conditions: { requires: ['usesLLMApi'], aiDependence: { none: 0, feature: 0.6, core: 1, wrapper: 1.2 } },
    effects: { text: 'Elevated errors for 30 min–6 h. AI features fail; tickets spike.', durationHours: [0.5, 6], ticketsMult: [2, 6], durationDays: 1 },
    playerResponses: [
      { id: 'status', label: 'Post on status page and in-app banner', hours: 0.5, cost: 0, outcome: 'Fewer tickets, less anger.', effectHints: { ticketsMult: '×0.6' } },
      { id: 'failover', label: 'Fail over to a second provider (needs routing layer)', hours: 1, cost: 0, outcome: 'Users barely notice.', effectHints: { ticketsMult: 1.2 } },
    ],
    promptHint: 'Write a status-page incident entry from an LLM provider (investigating → identified → resolved) with timestamps in the game clock, and two support tickets from the player\'s users.',
    sources: [S.design],
  },

  // ---------------------------------------------------------------- platform
  {
    id: 'google_core_update',
    label: 'Google core update rolls out',
    category: 'platform',
    baseRatePerYear: 3.3,
    conditions: { requires: ['usesSEO'], model: { b2c: 1.2, smb: 1, ent: 0.7 } },
    effects: { text: 'Two-week rollout. Rankings shift. Draw the change from content quality: thin/AI-spam pages lose, pages with first-hand expertise and real reviews gain.', organicTrafficMult: [0.6, 1.3], durationDays: 120 },
    playerResponses: [
      { id: 'wait', label: 'Wait for the rollout to finish before changing anything', hours: 0, cost: 0, outcome: 'Standard advice; partial recovery often happens by itself.', effectHints: {} },
      { id: 'prune', label: 'Prune/merge thin pages and add first-hand evidence', hours: 20, cost: 0, outcome: 'Better odds at the next update.', effectHints: { nextUpdateBias: '+0.1' } },
      { id: 'diversify', label: 'Shift effort to being cited by AI answers and review sites', hours: 10, cost: 0, outcome: 'Less dependence on Google rankings.', effectHints: { aiReferralMult: 1.15 } },
    ],
    promptHint: 'Write a Search Engine Roundtable-style note that Google confirmed a core update started rolling out today, and an analytics alert email showing the player\'s organic sessions change (use the drawn multiplier).',
    sources: [S.coreUpdates, S.aio],
  },
  {
    id: 'meta_ad_account_restricted',
    label: 'Meta ad account restricted',
    category: 'platform',
    baseRatePerYear: 0.18,
    conditions: { requires: ['runsMetaAds'], model: { b2c: 1.3, smb: 1, ent: 0.7 }, exposure: { usesAdAutomationAgent: 2, verifiedBusiness: 0.5 } },
    effects: { text: 'Ads stop. Appeals are partly automated. Most cases resolve in 3–21 days; 10–20% are permanent. (No published base rate.)', paidMetaSpendMult: 0, resolveDays: [3, 21], permanentChance: 0.15, durationDays: 21 },
    playerResponses: [
      { id: 'appeal', label: 'Appeal with documentation', hours: 3, cost: 0, outcome: 'Most likely restored in 1–3 weeks.', effectHints: { resolveDays: [3, 14] } },
      { id: 'shift', label: 'Shift budget to Google/other channels meanwhile', hours: 4, cost: 0, outcome: 'Keeps volume partly; CAC higher.', effectHints: { cacMult: 1.2 } },
      { id: 'new_account', label: 'Open a new account to get around it', hours: 2, cost: 0, outcome: 'Violates Meta policy; high chance of a permanent ban of all linked assets.', effectHints: { permanentChance: 0.6 } },
    ],
    promptHint: 'Write the Meta Business Support notification that the player\'s ad account is restricted ("doesn\'t follow our Advertising Standards"), vague as these really are, plus the appeal form prompt.',
    sources: [S.metaBans, S.design],
  },
  {
    id: 'app_store_rejection',
    label: 'App update rejected in review',
    category: 'platform',
    baseRatePerYear: 1.2, // ≈ ~5 submissions/yr × ~23–25% Apple rejection
    conditions: { requires: ['hasIOSApp'], model: { b2c: 1.3, smb: 1, ent: 0.8 } },
    effects: { text: 'Release blocked until fixed (metadata, payments/link-out wording, privacy labels, crashes).', releaseDelayDays: [1, 10], durationDays: 10 },
    playerResponses: [
      { id: 'fix', label: 'Fix and resubmit', hours: 4, cost: 0, outcome: 'Approved in 1–3 days usually.', effectHints: {} },
      { id: 'appeal', label: 'Reply in Resolution Center / appeal', hours: 2, cost: 0, outcome: 'Works when the reviewer misread; slower otherwise.', effectHints: { releaseDelayDays: [2, 14] } },
    ],
    promptHint: 'Write an App Store Connect rejection message citing a plausible guideline number and reason relevant to the player\'s app (e.g. 3.1.1, 5.1.1, 2.1). Concise and bureaucratic.',
    sources: [S.appleReview],
  },
  {
    id: 'ios_link_out_opportunity',
    label: 'Web checkout link-outs allowed in US iOS apps',
    category: 'platform',
    baseRatePerYear: 0, // one-off: already true since 2025-04-30; surface as an option when the player has an iOS app
    conditions: { requires: ['hasIOSApp'], model: { b2c: 1, smb: 0.5, ent: 0.2 } },
    effects: { text: 'US users can be linked to web checkout without Apple commission (under appeal). Saves the 15–30% store fee but web checkout converts lower for some users.', storeFeeSavedShare: [0.15, 0.3], checkoutConversionMult: [0.8, 1.0], durationDays: 9999 },
    playerResponses: [
      { id: 'add_web_checkout', label: 'Add web checkout link for US users', hours: 16, cost: 0, outcome: 'Higher net revenue per sale; some conversion loss; legal status could change on appeal.', effectHints: {} },
    ],
    promptHint: 'Write a short explainer email from the player\'s payments/MoR provider about adding web checkout for US iOS users after Epic v. Apple (April 2025), noting the appeal is ongoing.',
    sources: [S.epic],
  },
  {
    id: 'marketplace_policy_change',
    label: 'A marketplace you sell through changes its rules',
    category: 'platform',
    baseRatePerYear: 0.3,
    conditions: { requires: ['marketplaceDependent'] },
    effects: { text: 'New review requirements, ranking changes, fees or a platform migration (cf. Atlassian ended Server apps 2024-02-15).', marketplaceLeadsMult: [0.6, 1.0], rebuildHours: [0, 120], durationDays: 180 },
    playerResponses: [
      { id: 'comply', label: 'Comply/rebuild', hours: 40, cost: 0, outcome: 'Keeps the channel.', effectHints: { marketplaceLeadsMult: 1.0 } },
      { id: 'diversify', label: 'Build a direct channel', hours: 30, cost: 0, outcome: 'Less platform risk long-term.', effectHints: { platformDependence: -0.2 } },
    ],
    promptHint: 'Write a partner-program email from the marketplace the player uses announcing a policy or fee change with an effective date ~90 days out.',
    sources: [S.atlassian, S.design],
  },

  // ---------------------------------------------------------------- macro
  {
    id: 'enterprise_budget_freeze',
    label: 'Budget freeze / renewal scrutiny wave',
    category: 'macro',
    baseRatePerYear: 0.25,
    conditions: { model: { b2c: 0.3, smb: 0.8, ent: 1.4 }, stage: { idea: 0, launched: 1, traction: 1, funded: 1 } },
    effects: { text: 'Buyers delay new purchases, push for discounts at renewal and consolidate vendors. Nice-to-have tools churn first.', salesCycleMult: [1.3, 1.6], expansionMult: [0.6, 0.8], voluntaryChurnMult: [1.1, 1.2], discountRequests: [0.2, 0.4], durationDays: 210 },
    playerResponses: [
      { id: 'roi_case', label: 'Build an ROI one-pager per account and get ahead of renewals', hours: 12, cost: 0, outcome: 'Renewals hold better.', effectHints: { voluntaryChurnMult: '-0.05' } },
      { id: 'annual_discount', label: 'Offer annual prepay discount', hours: 3, cost: 0, outcome: 'Cash now, lower ARPA.', effectHints: { annualShare: '+0.15', arpaMult: 0.85 } },
    ],
    promptHint: 'Write an email from a customer\'s finance/procurement contact announcing a software spend review and asking the player to justify the renewal or offer a discount. Match the player\'s customer type.',
    sources: [S.cio2025, S.fed],
  },
  {
    id: 'saas_sentiment_shift',
    label: 'Investor sentiment swings against non-AI SaaS',
    category: 'macro',
    baseRatePerYear: 0.3,
    conditions: { requires: ['hasInvestors'], path: { indie: 0.2, vc: 1 }, aiDependence: { none: 1.5, feature: 1.2, core: 0.8, wrapper: 1.3 } },
    effects: { text: 'Public software multiples drop (cf. Feb 2026 Cowork selloff). Seed/A investors ask about AI defensibility; non-AI SaaS rounds slow.', raiseOddsMult: [0.7, 0.9], valuationMult: [0.8, 0.95], durationDays: 120 },
    playerResponses: [
      { id: 'defensibility_memo', label: 'Write a defensibility memo for investors', hours: 6, cost: 0, outcome: 'Restores some confidence if you have proprietary data or workflow depth.', effectHints: { raiseOddsMult: '+0.1' } },
      { id: 'extend_runway', label: 'Cut burn to delay the raise', hours: 4, cost: 0, outcome: 'Waits out the window.', effectHints: { burnMult: 0.8 } },
    ],
    promptHint: 'Write a Bloomberg-style market headline and 2 sentences about software stocks falling on AI-agent fears, followed by a short message from one of the player\'s investors asking how this affects them. No fabricated index numbers beyond "fell sharply".',
    sources: [S.cowork],
  },

  // ---------------------------------------------------------------- security
  {
    id: 'card_testing_attack',
    label: 'Card-testing attack on your checkout',
    category: 'security',
    baseRatePerYear: 0.5,
    conditions: { requires: ['selfServeCheckout'], model: { b2c: 1.5, smb: 1, ent: 0.2 }, stage: { idea: 0, launched: 1, traction: 1.2, funded: 1.2 }, exposure: { captchaAndRateLimits: 0.3 } },
    effects: { text: 'Bots run 500–20,000 small authorizations over 1–48 h. You pay screening/auth fees, some disputes follow, and Stripe may flag the account.', attempts: [500, 20000], costUSD: [50, 3000], disputes: [0, 15], authRateMult: [0.9, 0.98], durationDays: 30 },
    playerResponses: [
      { id: 'lock_down', label: 'Add CAPTCHA, rate limits and Radar rules; require login before checkout', hours: 4, cost: 0, outcome: 'Attack stops within hours; future risk ×0.3.', effectHints: { futureRateMult: 0.3 } },
      { id: 'contact_stripe', label: 'Contact Stripe support for fee relief', hours: 1, cost: 0, outcome: 'Fees sometimes waived (not guaranteed).', effectHints: { costRefundShare: [0, 1] } },
    ],
    promptHint: 'Write a Stripe Radar alert email about an unusual spike in declined payments on the player\'s account (counts consistent with the drawn attempts), followed by 2 confused customer emails about $0.50–$1 charges they did not make.',
    sources: [S.stripeCT, S.redditRadar, S.design],
  },
  {
    id: 'leaked_secret',
    label: 'API key or secret leaked',
    category: 'security',
    baseRatePerYear: 0.1,
    conditions: { aiDependence: { none: 0.6, feature: 1, core: 1.3, wrapper: 1.3 }, exposure: { publicRepo: 2, secretScanning: 0.3 } },
    effects: { text: 'A key ends up in a repo, client bundle or log. Abuse runs up charges or exposes data. GitGuardian finds 70% of leaked secrets still valid years later.', abuseCostUSD: [100, 20000], detectHours: [2, 72], durationDays: 7 },
    playerResponses: [
      { id: 'rotate', label: 'Rotate keys, audit logs, ask provider for credit', hours: 4, cost: 0, outcome: 'Stops the bleed; partial credit common.', effectHints: { costRefundShare: [0, 0.8] } },
      { id: 'scanning', label: 'Also set up secret scanning and per-key spend limits', hours: 3, cost: 0, outcome: 'Future risk ×0.3.', effectHints: { futureRateMult: 0.3 } },
    ],
    promptHint: 'Write the automated email from a secret-scanning service or cloud provider saying an exposed credential was detected (redact most of it), and the billing alert that follows.',
    sources: [S.gitguardian, S.design],
  },
  {
    id: 'surprise_bill',
    label: 'Surprise cloud / AI bill',
    category: 'security',
    baseRatePerYear: 0.25,
    conditions: { aiDependence: { none: 0.5, feature: 1, core: 1.5, wrapper: 1.5 }, exposure: { spendCaps: 0.2, usageBilling: 1.3 } },
    effects: { text: 'A loop, abusive user, prompt-injected agent or misconfigured job multiplies usage. Bill is 3–30× a normal month.', infraBillMult: [3, 30], durationDays: 30 },
    playerResponses: [
      { id: 'caps', label: 'Fix the cause, set spend caps/alerts, request goodwill credit', hours: 6, cost: 0, outcome: 'Credit of 0–100% on request; risk drops sharply.', effectHints: { costRefundShare: [0, 1], futureRateMult: 0.2 } },
      { id: 'pay', label: 'Just pay it', hours: 0.5, cost: 0, outcome: 'Cash hit.', effectHints: {} },
    ],
    promptHint: 'Write the cloud/LLM provider billing alert ("your forecasted spend exceeded…") with amounts consistent with game state, and a one-line log excerpt hinting at the cause.',
    sources: [S.billShock, S.design],
  },
  {
    id: 'data_breach',
    label: 'Security incident with customer data exposure',
    category: 'security',
    baseRatePerYear: 0.02,
    conditions: { model: { b2c: 1.2, smb: 1, ent: 1.3 }, stage: { idea: 0, launched: 1, traction: 1.3, funded: 1.5 }, exposure: { adminMFA: 0.5, testedBackups: 0.8 } },
    effects: { text: 'Notification duties apply (GDPR 72 h to regulator if risky; US states typically 30–60 days; B2B DPAs often 24–72 h to customers). Trust hit, churn, legal cost.', churnMult: [1.2, 2.0], conversionMult: [0.7, 0.9], legalCostUSD: [5000, 50000], founderHours: [30, 120], durationDays: 120 },
    playerResponses: [
      { id: 'transparent', label: 'Contain, notify promptly and transparently, publish a postmortem', hours: 40, cost: 10000, outcome: 'Smaller long-run trust damage; regulators view prompt notice favorably.', effectHints: { churnMult: '-0.2' } },
      { id: 'minimize', label: 'Notify only where strictly required', hours: 15, cost: 5000, outcome: 'Cheaper now; if it leaks later the damage is larger.', effectHints: { laterExposureRisk: 0.4 } },
    ],
    promptHint: 'Write the first alert the player receives (from a customer, a researcher\'s responsible-disclosure email, or a monitoring tool) indicating customer data may be exposed. Specific to the player\'s stack and data types; no real CVE numbers.',
    sources: [S.dbir, S.gdpr, S.design],
  },
  {
    id: 'security_questionnaire',
    label: 'Enterprise security questionnaire arrives',
    category: 'security',
    baseRatePerYear: 4,
    conditions: { model: { b2c: 0, smb: 0.3, ent: 1.5 }, stage: { idea: 0, launched: 0.5, traction: 1, funded: 1.5 } },
    effects: { text: 'CAIQ (~261 q), SIG Lite (150–200 q) or a custom sheet. Deal stalls until answered. No SOC 2 = 20–40% loss risk at mid-market+.', hours: [20, 40], dealDelayDays: [7, 30], dealLossRiskNoSOC2: [0.2, 0.4], durationDays: 30 },
    playerResponses: [
      { id: 'answer', label: 'Answer it yourself', hours: 25, cost: 0, outcome: 'Builds an answer library; next ones take 2–8 h.', effectHints: { futureHoursMult: 0.2 } },
      { id: 'trust_center', label: 'Buy a compliance platform + trust center and start SOC 2', hours: 30, cost: 8000, outcome: 'Most future questionnaires need ~0–2 h; deal loss risk falls.', effectHints: { dealLossRiskNoSOC2: 0.08 } },
    ],
    promptHint: 'Write a procurement email from the prospect\'s security team attaching a vendor questionnaire, naming the format (CAIQ, SIG Lite or custom), a deadline, and 5 sample questions relevant to the player\'s product.',
    sources: [S.secQ],
  },

  // ---------------------------------------------------------------- ops
  {
    id: 'self_inflicted_outage',
    label: 'Outage caused by your own change',
    category: 'ops',
    baseRatePerYear: 5,
    conditions: { stage: { idea: 0, launched: 1, traction: 1.3, funded: 1.2 }, exposure: { automatedTests: 0.6, stagingEnv: 0.7 } },
    effects: { text: 'Bad deploy, migration, expired cert/domain, connection limit. MTTR 20–90 min if awake and alerted; 4–10 h overnight without paging.', durationHours: [0.3, 10], ticketsMult: [3, 10], churnRiskBump: [0, 0.02], durationDays: 2 },
    playerResponses: [
      { id: 'postmortem', label: 'Fix, write a short public postmortem', hours: 3, cost: 0, outcome: 'Trust recovers faster; ticket spike ×0.6.', effectHints: { ticketsMult: '×0.6', churnRiskBump: '×0.5' } },
      { id: 'alerting', label: 'Add uptime monitoring + phone paging', hours: 2, cost: 20, outcome: 'Future overnight MTTR ~1 h.', effectHints: { overnightMttrHours: 1 } },
    ],
    promptHint: 'Write 3 customer messages (support tickets/tweets) reacting to an outage of the player\'s product, in tones matching the customer type, plus a monitoring alert text.',
    sources: [S.dora, S.design],
  },
  {
    id: 'upstream_outage',
    label: 'Upstream cloud/CDN outage',
    category: 'ops',
    baseRatePerYear: 2.5,
    conditions: { stage: { idea: 0.2, launched: 1, traction: 1, funded: 1 } },
    effects: { text: 'Your host/CDN/auth/payments provider goes down (cf. AWS us-east-1 2025-10-19/20; Cloudflare 2025-11-18). Nothing to fix; communication is what matters.', durationHours: [0.5, 15], ticketsMult: [2, 6], durationDays: 1 },
    playerResponses: [
      { id: 'communicate', label: 'Status page + banner + one tweet', hours: 0.5, cost: 0, outcome: 'Customers blame the provider, not you.', effectHints: { ticketsMult: '×0.5' } },
      { id: 'multi_region', label: 'Invest in redundancy afterwards', hours: 40, cost: 0, outcome: 'Future impact ×0.5; higher infra cost.', effectHints: { infraCostMult: 1.3 } },
    ],
    promptHint: 'Write a provider status-page incident (generic provider type matching the player\'s stack, e.g. "your CDN provider") and a news headline about a widespread internet outage. Do not claim it is a real past event.',
    sources: [S.outages2025, S.uptime],
  },

  // ---------------------------------------------------------------- reputation
  {
    id: 'negative_public_review',
    label: 'Angry public review or post',
    category: 'reputation',
    baseRatePerYear: 1.5,
    conditions: { model: { b2c: 2, smb: 1, ent: 0.4 }, stage: { idea: 0, launched: 1, traction: 1.4, funded: 1.4 }, exposure: { slowSupport: 2, recentOutage: 1.5 } },
    effects: { text: 'A 1★ review or Reddit/X post about billing, support or a bug. Matters most when you have few reviews.', conversionMult: [0.92, 0.99], durationDays: 90 },
    playerResponses: [
      { id: 'respond', label: 'Respond publicly, calmly, and fix the issue', hours: 1.5, cost: 0, outcome: 'Often updated to 3–4★; readers see a responsive founder.', effectHints: { conversionMult: '+0.03' } },
      { id: 'argue', label: 'Argue with the reviewer', hours: 1, cost: 0, outcome: 'Screenshot risk; makes it worse.', effectHints: { conversionMult: '-0.03' } },
    ],
    promptHint: 'Write a realistic 1–2★ review (G2/Capterra for B2B, App Store/Trustpilot for B2C) from a specific customer persona already in the game, about a concrete issue from game state (slow support, a bug, a billing surprise).',
    sources: [S.spiegel, S.npDigital],
  },
  {
    id: 'fake_review_temptation',
    label: 'Offer to buy reviews',
    category: 'reputation',
    baseRatePerYear: 3,
    conditions: { model: { b2c: 1.5, smb: 1, ent: 0.4 }, stage: { idea: 0, launched: 1, traction: 1, funded: 0.8 } },
    effects: { text: 'A "reputation agency" offers 5★ reviews. Illegal under the FTC rule (effective 2024-10-21; up to $51,744 per violation, indexed). Platforms remove ~7% of reviews as fake.', durationDays: 1 },
    playerResponses: [
      { id: 'decline', label: 'Ignore / report', hours: 0.1, cost: 0, outcome: 'Nothing happens.', effectHints: {} },
      { id: 'buy', label: 'Buy 20 reviews', hours: 0.5, cost: 300, outcome: 'Short-term rating bump; 30–60% are removed; chance of platform penalty badge or FTC exposure.', effectHints: { ratingBumpDays: 60, platformPenaltyChance: 0.25, legalRisk: 'per-review civil penalty exposure' } },
    ],
    promptHint: 'Write a spammy cold email offering "verified 5-star reviews" for the player\'s G2/Trustpilot/App Store listing, with telltale signs of a scam.',
    sources: [S.ftc, S.trustpilot],
  },
  {
    id: 'review_site_badge',
    label: 'You earn a review-site badge or LLM mention',
    category: 'reputation',
    baseRatePerYear: 0.6,
    conditions: { stage: { idea: 0, launched: 0.5, traction: 1.3, funded: 1.5 }, exposure: { reviews20Recent: 2.5 } },
    effects: { text: 'A seasonal G2 "High Performer"-style badge or recurring mention in AI-chatbot answers. 51% of B2B buyers start research in a chatbot (G2 2026).', conversionMult: [1.02, 1.08], aiReferralMult: [1.1, 1.3], durationDays: 120 },
    playerResponses: [
      { id: 'use_it', label: 'Add badge to site and sales deck', hours: 1, cost: 0, outcome: 'Small lift in B2B trust.', effectHints: {} },
    ],
    promptHint: 'Write the review-site notification that the player\'s product earned a seasonal badge in its category (no real category rankings), or a screenshot-style chatbot answer that mentions the product among 3 options.',
    sources: [S.g2buyer, S.capterra],
  },

  // ---------------------------------------------------------------- life
  {
    id: 'founder_illness',
    label: 'You get sick',
    category: 'life',
    baseRatePerYear: 2,
    conditions: { exposure: { lowEnergy: 1.5, hasYoungKids: 1.5 } },
    effects: { text: 'Cold, stomach bug or flu (flu hits ~8% of people per season). 1–3 days lost for minor illness, 4–10 for flu.', daysLost: [1, 10], capacityMult: 0.2, durationDays: 7 },
    playerResponses: [
      { id: 'rest', label: 'Rest and cancel meetings', hours: 0, cost: 0, outcome: 'Back to full energy afterwards.', effectHints: { energy: '+10' } },
      { id: 'push_through', label: 'Work through it', hours: 0, cost: 0, outcome: 'Half output, illness lasts longer, mistakes more likely.', effectHints: { daysLostMult: 1.5, errorRisk: 0.1 } },
    ],
    promptHint: 'Write a short iMessage exchange between the founder and a friend/partner on the morning they wake up sick, referencing a real meeting on the founder\'s in-game calendar.',
    sources: [S.cdcFlu, S.design],
  },
  {
    id: 'family_care_crisis',
    label: 'Family member needs care',
    category: 'life',
    baseRatePerYear: 0.15,
    conditions: { exposure: { age45plus: 1.8, hasYoungKids: 1.3 } },
    effects: { text: 'A parent\'s hospitalization, a child\'s illness, a partner\'s emergency. ~24% of US adults were caregivers in the past year; a quarter of them 40+ h/week.', capacityMult: [0.3, 0.7], durationDays: [7, 60] },
    playerResponses: [
      { id: 'step_back', label: 'Step back, automate and tell customers/investors', hours: 2, cost: 0, outcome: 'Business slows but trust holds; investors are usually supportive.', effectHints: { investorWarmth: '+0' } },
      { id: 'hire_help', label: 'Pay for help (contractor/care)', hours: 3, cost: 2000, outcome: 'Capacity loss halved.', effectHints: { capacityMult: '+0.2' } },
    ],
    promptHint: 'Write a phone call summary or text from a family member that starts the situation. Gentle, human, specific to the founder\'s backstory if known.',
    sources: [S.aarp],
  },
  {
    id: 'moving_home',
    label: 'You need to move',
    category: 'life',
    baseRatePerYear: 0.1,
    conditions: { exposure: { renter: 1.5, age45plus: 0.5 } },
    effects: { text: 'Lease ends, rent rises or relocation. ~11.8% of Americans moved in 2024.', daysLost: [4, 10], cost: [1500, 8000], durationDays: 30 },
    playerResponses: [
      { id: 'movers', label: 'Pay movers', hours: 10, cost: 3000, outcome: 'Fewer lost days.', effectHints: { daysLost: [2, 4] } },
      { id: 'diy', label: 'Do it yourself', hours: 40, cost: 800, outcome: 'Cheap, exhausting.', effectHints: { energy: '-15' } },
    ],
    promptHint: 'Write the landlord email about the lease renewal with a rent increase, or a partner text about a job relocation.',
    sources: [S.acs],
  },
  {
    id: 'burnout_episode',
    label: 'Burnout episode',
    category: 'life',
    baseRatePerYear: 0, // state-driven: trigger when energy < 20 (see WELLBEING.energyModel), not by base rate
    conditions: { exposure: { hoursOver60: 2.5, noPeerSupport: 1.4, therapyOrCoach: 0.6 } },
    effects: { text: 'Exhaustion, cynicism, reduced efficacy. ~54% of founders report burnout in a year (Sifted 2025).', capacityMult: [0.3, 0.5], durationDays: [14, 42], decisionNoise: 0.2 },
    playerResponses: [
      { id: 'real_break', label: 'Take a real week off, then cap hours at 50', hours: 0, cost: 500, outcome: 'Recovery in 2–3 weeks; output higher after.', effectHints: { durationDays: [10, 21] } },
      { id: 'grind', label: 'Push through', hours: 0, cost: 0, outcome: 'Lasts longer; risk of a bad strategic call.', effectHints: { durationDays: [30, 60], badDecisionChance: 0.25 } },
    ],
    promptHint: 'Write a journal entry or a note from a friend that makes the burnout visible through concrete details from the last weeks of the founder\'s game calendar and metrics. Not melodramatic.',
    sources: [S.sifted, S.mars, S.bii],
  },
];

export const SUPPORT = {
  ticketsPerCustomerPerMonth: {
    // [design] ranges anchored on vendor-blog benchmarks; tune with docs quality
    b2c: [0.08, 0.2], smb: [0.25, 0.6], ent: [0.4, 1.0], // ent = per account; founder-stage accounts with few active users (Helpdesk review S3)
    firstMonthMult: [2, 3], releaseWeekMult: 1.5, outageMult: [3, 10], goodDocsMult: 0.7,
    benchmarkQuoted: { b2bSaaS: [0.2, 0.5], highTouchEnt: [0.5, 1.0], selfServe: [0, 0.2], b2cPerYear: [1.2, 2.4], b2bEntPerYear: [4, 8] },
    sources: [S.ticketsBlog, S.design],
  },
  firstResponse: {
    softwareMedianMinutes: 47, top20pctMinutes: 3, slowTierHours: 6, olderEmailAverageHours: 12.2,
    targetsB2B: { good: '<12h', better: '<4h', best: '<1h' }, chatMedianSeconds: [30, 95],
    churnMultByMedianFRT: [ // [design], evidence is correlational (timetoreply 71% vs 48% retention, <1h vs 24h)
      { maxHours: 1, mult: 0.95 }, { maxHours: 8, mult: 1.0 }, { maxHours: 24, mult: 1.08 }, { maxHours: 72, mult: 1.2 }, { maxHours: Infinity, mult: 1.4 },
    ],
    csatByFRT: { under5min: 0.92, at24h: 0.51 },
    sources: [S.freshworks, S.superoffice, S.timetoreply, S.design],
  },
  aiResolution: {
    vendorClaim2025: 0.67, vendorClaim2026: 0.76, vendorOwnSupport: 0.81, caseStudies: [0.42, 0.5], independentSMBTest: 0.38,
    gameYearOne: [0.3, 0.55], gameMature: [0.55, 0.7], neverResolves: ['billing disputes', 'angry churn-risk customers', 'bugs needing code', 'enterprise escalations'],
    badAnswerCsatPenalty: [0.02, 0.08], matureDeploymentShareOfOrgs: 0.1, gartner2029Prediction: 0.8,
    sources: [S.fin, S.intercom2026, S.gartnerCS, S.design],
  },
  satisfaction: {
    csatGood: [0.75, 0.85], csatSaaSAggregator: 0.8,
    nps: { b2bMedian: 38, b2cMedian: 49, softwareMedian: 30, b2bSaaSAvgUserpilot: 35.7, aboveMedianB2B: 40 },
    sources: [S.survicate, S.userpilot],
  },
};

export const REVIEWS = {
  requestToReview: { // share of asked customers who post
    b2bEmailAsk: [0.04, 0.1], b2bEmailWithCompliantIncentive: [0.15, 0.25], personalAskAfterWin: [0.2, 0.35], b2cInAppPrompt: [0.01, 0.03],
    servicesBenchmark: { automatedEmail: [0.1, 0.15], inPerson: [0.3, 0.45] },
    bestMoments: ['after a milestone/aha', 'after a resolved ticket with CSAT 5', 'at renewal or upgrade', '~90 days in'],
    iosPromptCapPerYear: 3,
    sources: [S.focusDigital, S.appleRating, S.design],
  },
  ratingToConversion: {
    appStoreIndex: { 5: 1.0, 4: 0.83, 3: 0.57 }, peakStars: [4.2, 4.5],
    gameB2CBelow4Mult: [0.6, 0.75], gameB2BBelow4Mult: 0.85,
    sources: [S.npDigital, S.spiegel],
  },
  countThresholds: [ // [design] from Spiegel (e-commerce) shape; B2B magnitude unmeasured
    { minReviews: 0, b2bMult: 0.9, b2cMult: 0.8 },
    { minReviews: 5, b2bMult: 1.0, b2cMult: 1.0 },
    { minReviews: 20, b2bMult: 1.05, b2cMult: 1.05, aiReferralMult: 1.2, requiresRecentMonths: 12 },
  ],
  buyerBehavior: { reviewsSignificantInfluenceSMB: 0.52, verifiedImportant: 0.89, shortlistTopSourceAIChatbots: 0.17, shortlistReviewSites: 0.15, startResearchInChatbot2026: 0.51, switchedVendorDueToChatbot2026: 0.69, recencyMattersMonths: 12, sources: [S.capterra, S.g2buyer] },
  rules: { ftcEffective: '2024-10-21', maxCivilPenaltyPerViolationUSD2024: 51744, indexedAnnually: true, allowedIncentive: 'only if not conditioned on sentiment and disclosed', banned: ['fake/AI-generated reviews', 'buying positive reviews', 'undisclosed insider reviews', 'review suppression', 'fake social indicators'], sources: [S.ftc] },
  platformFakeRemoval: { trustpilot2024Share: 0.074, trustpilot2023Share: 0.061, automatedShare: 0.9, sources: [S.trustpilot] },
};

export const PRODUCT_ANALYTICS = {
  activation: { avgB2B: 0.375, medianB2B: 0.37, byVertical: { aiMl: 0.548, healthcare: 0.238, fintech: 0.05 }, timeToValueHours: 36, checklistCompletion: 0.192, oneMonthRetention: 0.469, sources: [S.userpilot] },
  ttvActivationPenaltyPerExtraDay: [0.03, 0.06], // relative, self-serve [design]
  featureAdoption: { coreFeatureAdoption: 0.245, rarelyOrNeverUsedShare: 0.8, clicksFromTop12pctFeatures: 0.8, newFeature90DayAdoption: [0.1, 0.3], sources: [S.userpilot, S.pendo, S.design] },
  retention: { d7TopQuartileThreshold: 0.07, topD7AlsoTopM3: 0.69, activatedVsNotM3RetentionMult: [2, 3], sources: [S.amplitude, S.design] },
};

export const OPS = {
  uptime: { downtimeMinutesPer30DaysAt999: 43.2, downtimeHoursPerYearAt999: 8.8 },
  incidents: { userVisiblePerYear: [6, 12], majorPerYear: [1, 2], upstreamPerYear: [2, 4], llmProviderPerYear: [2, 6], typicalCauses: ['bad deploy/migration', 'expired cert or domain', 'DB connection/disk limits', 'third-party API change', 'LLM provider errors', 'queue backlog', 'DNS/CDN'], sources: [S.design, S.outages2025] },
  mttr: { soloAwakeMinutes: [20, 90], soloOvernightHours: [4, 10], doraEliteHours: 1, doraEliteShare: 0.19, statusPageTicketMult: 0.6, sources: [S.dora, S.design] },
  dataCenterOutageCauses2024: { power: 0.54, itNetwork: 0.23, seriousOrSevere: 0.09, sources: [S.uptime] },
  costs: { llmPriceDeclinePerYearFixedCapability: [9, 900], migrateTierSavings: [0.3, 0.8], surpriseBillPerYear: { noCaps: [0.15, 0.4], withCaps: [0.03, 0.08] }, surpriseBillMult: [3, 30], sources: [S.epoch, S.billShock, S.design] },
  cardTesting: { stripe2022PeakBlockedPerDay: 20e6, growthSince2019: 100, successfulDeclineLater: 0.8, attacksPerYear: { exposedCheckout: [0.3, 1.0], protected: [0.1, 0.3], invoiceOnly: 0 }, attemptsPerAttack: [500, 20000], costUSD: [50, 3000], founderHours: [2, 8], disputeFeeUSD: 15, sources: [S.stripeCT, S.redditRadar, S.design] },
  security: { leakedSecrets2024: 23.8e6, stillValidAfter2y: 0.7, privateReposWithSecrets: 0.35, smbBreachesWithRansomware: 0.88, medianRansomUSD: 115000, breachPerYearTinySaaS: [0.01, 0.04], leakedKeyPerYear: [0.05, 0.2], notification: { gdprHours: 72, usStatesTypicalDays: [30, 60], b2bDpaHours: [24, 72] }, sources: [S.gitguardian, S.dbir, S.gdpr, S.design] },
};

export const INVESTOR_RELATIONS = {
  updates: { cadence: { preseedToA: 'monthly', bPlus: 'quarterly' }, avgRecipients: 57, hoursPerUpdate: [1, 3], hoursWithTemplate: [0.5, 1], askFulfilledChancePerUpdate: [0.05, 0.15], warmthDecayPerMissedMonth: 0.1, consistentSixMonthsInsiderOddsMult: 1.3, surpriseBadNewsAtRaiseWarmth: -0.3, structure: ['one-line summary', 'KPIs with stable definitions (MRR, growth, gross/net burn, runway, cash, customers, headcount)', '3–5 highlights', 'lowlights, honest', 'up to 3–4 specific asks'], unverifiedClaims: ['"3x more likely to raise follow-on" (Visible, no method)'], sources: [S.visible, S.design] },
  board: { seatsAfterPricedSeed: 3, cadenceWeeks: [6, 13], meetingHours: [1.5, 3], prepHoursFirst: [6, 12], prepHoursLater: [3, 6], safeGivesBoardSeat: false, infoRightsPricedRound: 'major investors: annual financials, often quarterly statements + budget', sources: [S.boards, S.design] },
  advisors: { equityPct: [0.25, 1], vestingYears: 2, cliffMonths: [0, 3], trialBeforeGrantMonths: 1, hoursPerMonth: [1, 2], usefulIntrosPerYear: [1, 4], goQuietWithinYear: 0.5, sources: [S.fast, S.design] },
};

export const WELLBEING = {
  prevalence: { burnoutPast12m: 0.54, anxiety: 0.75, mentalHealthBad: 0.46, over50hWeek: 0.67, womenBurnoutMaRS: 0.65, menBurnoutMaRS: 0.42, lifetimeConditionFreeman: 0.49, lonelinessRange: [0.27, 0.76], sources: [S.sifted, S.mars, S.bii, S.freeman, S.lonely] },
  energyModel: { // [design]
    range: [0, 100], weeklyCostOver55h: [3, 6], weeklyRestoreUnder45hWithDayOff: [4, 8], sleepUnder6hCost: 5,
    lowThreshold: 40, lowEffects: { velocityMult: 0.8, csatPenaltyPts: 5, overconfidentChoiceChance: [0.1, 0.2] },
    burnoutThreshold: 20, burnoutCapacity: [0.3, 0.5], burnoutWeeks: [2, 6],
    annualBurnoutRisk: { over60h: 0.5, h45to55WithSupport: 0.2 },
  },
  sleepEvidence: 'One night of sleep loss blunts reward/loss response; chronic restriction worse; sleep-deprived take more risk when expecting success.',
  lifeEvents: { fluPerSeason: 0.08, fluRange: [0.03, 0.11], minorIllnessPerYear: [1, 3], movedPerYearUS: 0.118, caregiverShareAdults: 0.24, caregivers40hPlusShare: 0.25 },
  resources: ['founder peer group', 'therapist/coach ($100–250/session US)', '988 crisis line (US)', 'protected day off'],
  sources: [S.sleep, S.cdcFlu, S.acs, S.aarp],
};

export const COFOUNDER = {
  context: { soloLedShareNewStartups: 0.36, ycSoloShare2026: [0.11, 0.19] },
  equity: { equalSplitTwoFounders2024: 0.459, equalSplit2025: [0.44, 0.46], equalSplit2015: 0.315, medianSplit: [51, 49], sources: [S.cartaSplit] },
  departures: { vcBackedLoseCofounderByYear4: 0.25, after3YearsQ12017Cohort: 0.171, clusterYears: [1, 3], peopleProblemsShareOfFailures: 0.65, sources: [S.cartaDepart, S.wasserman] },
  matching: { ycInviteAcceptance: 0.25, ycSameCountry: 0.55, ycWithin3TimeZones: 0.61, platformMatchToPartnershipNote: 'fast matches, low conversion (no published rate)', sources: [S.ycMatch, S.cofounderTime] },
  search: { monthsTypical: [3, 6], monthsNetwork: [3, 12], trialMonths: [1, 3], hoursPerMonth: 10,
    funnelPerMonth: { profilesViewed: [15, 40], introCalls: [4, 10], deepConversations: [1, 2], trialStarts: [0.15, 0.35] }, // [design]
    trialSuccess: [0.35, 0.55], // [design]
    annualBreakupHazard: { years1to3: [0.08, 0.1], after: 0.03, strangersNoTrialMult: 1.5, priorColleaguesMult: 0.7 }, // [design]
    breakupDisruptionWeeks: [4, 12],
    sources: [S.cofounderTime, S.design] },
  vesting: { standard: '4 years, 1-year cliff', newCofounderJoiningLate: 'new 4-year schedule', resetCreditAtPricedRound: [0.1, 0.25], sources: [S.vestReset] },
};

export const OTHER_SYSTEMS = {
  securityReviews: { caiqQuestions: 261, sigLiteQuestions: [150, 200], sigFullQuestions: 800, firstTimeHours: [20, 40], withLibraryHours: [2, 8], enterpriseAssessmentsPerYear: 150, acceptStandardShare: 0.74, sources: [S.secQ] },
  renewals: { upliftTypical: [0.05, 0.1], negotiatedDiscount: [0.15, 0.2], noticeDays: 90, qbrAboveACV: 10000, qbrPrepHours: [2, 4], acceptanceAtUpTo7pct: [0.7, 0.9], acceptanceAt15pctPlus: [0.5, 0.7], sources: [S.renewals, S.design] },
  accessibility: { eaaApplies: '2025-06-28', microenterpriseExempt: '<10 staff and ≤€2M turnover or balance sheet (services)', requestsPerYearUpmarket: [0.5, 2], remediationHours: [20, 80], sources: [S.eaa, S.design] },
  localization: { localCurrencyConversionMult: [1.05, 1.15], localPaymentMethodsMult: [1.1, 1.3], translationHoursPerLanguage: [10, 40], note: 'Vendor claims of +25–30% unverified', sources: [S.design] },
  usageBilling: { invoiceQuestionsShareMonthly: [0.02, 0.05], backlashChanceIfNoGrandfathering: [0.1, 0.3], sources: [S.billShock, S.design] },
};
