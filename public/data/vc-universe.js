// VC universe data for the fundraising sim: fund tiers, angel tiers, fund-returner math constants,
// venture-scale classes + text signals, sectors, geos, thesis templates, name parts, pedigree effects, AI-era config.
// Research and sources: docs/research/vc-decisions-2026.md (consolidates r1-r5 scratch research).
// Convention: URLs in comments are the evidence; anything tagged [design] is a game calibration, never a real statistic;
// [heuristic] = widely stated practitioner rule of thumb, no audited dataset. Logic lives in public/apps/fundraising/vclens.js
// and universe.js; this file is data only (no functions except nothing; keep it import-safe and deterministic).
//
// Fund-returner idea: required exit = fund size / (entry ownership x (1 - dilution to exit)).
// Example: $50M fund, 10% entry, 50% dilution -> 5% at exit -> $1.0B exit. A $1B fund at 15% -> $13B.

export const SOURCES = {
  nvca2026: 'https://nvca.org/press_releases/nvca-releases-2026-yearbook-charts-a-venture-industry-in-transition/',
  pbq2: 'https://siliconangle.com/2026/07/09/pitchbook-us-venture-funding-hits-412-7b-first-half-ai-deals-dominate/',
  pbq1: 'https://nvca.org/wp-content/uploads/2026/04/Q1-2026-PitchBook-NVCA-Venture-Monitor.pdf',
  concentration: 'https://www.venture360.co/resources/three-firms-raised-nearly-half-of-all-vc-capital',
  vcbeastBets: 'https://vcbeast.com/portfolio-construction-vc-funds-how-many-bets',
  vcbeastPlan: 'https://vcbeast.com/portfolio-construction-plan',
  vcbeastMath: 'https://vcbeast.com/math-behind-vc-returns-entry-to-exit',
  emergent: 'https://getlatka.com/interviews/emergent-ventures-anupam-rastogi-2023',
  cartaFunds: 'https://carta.com/data/newsletter-full-vc-fund-data/',
  cartaFundI: 'https://carta.com/data/fund-i-report-2021-year-in-review/',
  cartaSeedDilution: 'https://carta.com/data/linkedin-seed-dilution-30-percent-under-10/',
  cartaRounds: 'https://carta.com/data/linkedin-vc-round-data-2025-valuations-dilution/',
  cartaRepeat: 'https://carta.com/data/linkedin-repeat-founders-majority-early-stage-capital/',
  cartaSolo: 'https://carta.com/data/solo-founders-report',
  cartaSeedToA: 'https://carta.com/data/linkedin-seed-to-series-a-light-at-tunnel-2025/',
  cartaPreSeed: 'https://carta.com/data/state-of-pre-seed-q2-2026/',
  cartaAngelCheck: 'https://carta.com/data/linkedin-angel-check-size-50k-to-30k/',
  correlation: 'https://lifescivc.com/2013/11/correlations-fresh-look-at-venture-capital-returns/',
  harlem: 'https://harlem.capital/can-your-startup-return-the-fund-6e233bd5c8b2/',
  lemkinTam: 'https://www.saastr.com/tam-is-great-but-what-really-matters-is-that-you-believe-you-can-hit-100m-in-7-years/',
  lemkinSmallTam: 'https://www.saastr.com/what-to-do-if-your-tam-is-too-small-for-vcs',
  stanfordFunnel: 'https://gsb.stanford.edu/insights/quick-study-how-think-venture-capitalist',
  ggks: 'https://corpgov.law.harvard.edu/2019/08/20/how-do-venture-capitalists-make-decisions',
  bernstein: 'https://www.gsb.stanford.edu/insights/shai-bernstein-what-really-matters-early-stage-investors',
  gompers2010: 'https://www.nber.org/papers/w12592',
  crunchbaseSchools: 'https://news.crunchbase.com/venture/funded-founders-stanford-harvard-mit/',
  crunchbaseSchools2026: 'https://news.crunchbase.com/venture/top-universities-funded-founders-2026-stanford/',
  azoulay: 'https://www.nber.org/papers/w24489.pdf',
  crunchbase2025: 'https://news.crunchbase.com/venture/funding-data-third-largest-year-2025/',
  crunchbaseSectors: 'https://news.crunchbase.com/venture/beyond-ai-growing-startup-sectors-legal-robotics-defense/',
  unh: 'https://walnutinvest.com/stats/angel-investing-statistics',
  aiSeedPremium: 'https://hub.causo.ai/guides/ai-startup-funding-this-quarter',
  waveup: 'https://waveup.com/blog/seed-round-benchmarks/',
  megaSeeds: 'https://techcrunch.com/2026/02/17/here-are-the-17-us-based-ai-companies-that-have-raised-100m-or-more-in-2026/',
  amiLabs: 'https://altss.com/blog/march-2026-s-largest-startup-raises.md',
  yc: 'https://www.ycombinator.com/deal',
  tinyseed: 'https://tinyseed.com/latest/16m-fourth-saas-fund-raise',
  earnest: 'https://calmfund.com/writing/five-years',
  firstTimeFunds: 'https://vcbeast.com/how-emerging-managers-raise-a-first-fund',
  warmIntro: 'https://www.metal.so/collections/warm-intros-vs-cold-email-2025-conversion-data-referral-playbook',
  coldReply: 'https://founderscapital8.substack.com/p/cold-emails-to-vcs-have-a-95-non',
  sequoiaSeed: 'https://www.ellty.com/blog/seed-investors',
  a16zAiSeed: 'https://techflowpost.com/en-US/article/32240',
  benchmark: 'https://www.foundra.ai/vc/benchmark',
  seriesA: 'https://hub.causo.ai/series-a-valuation-2026',
  acquire: 'https://beancount.io/blog/2026/07/11/bootstrapped-saas-valuation-multiples-2026-acquire-com-indie-founders-guide',
  saasCapital: 'https://fungies.io/?p=40355',
  strebulaev: 'https://www.saastr.com/carta-of-seed-funded-start-ups-fail-and-1-3-become-unicorns/',
};
const S = SOURCES;

// ---------------------------------------------------------------------------------------------
// Fund tiers. fundSize in USD. firstCheck/ownership per stage (omit a stage = they don't do it).
// ownership: [hard minimum they'll accept, target]. coldReplyRate = P(reply) to a GOOD cold email.
// warmMeetingRate = P(first meeting | credible warm intro). Weights 0..1 are relative emphasis, not a sum.
// priceSensitivity: how much a high cap/valuation lowers odds (indie/micro high, top low: they pay up for ownership of winners).
// valuationPremium: multiplier on the price they'll pay when they lead (top pay up for hot deals, micro pay less).
// signal: multiplier on follower interest when this tier leads (herding; top > others).
// ---------------------------------------------------------------------------------------------
export const FUND_TIERS = {
  top: {
    label: 'Top-tier firm',
    fundSize: [1e9, 12e9], // multi-stage platforms; their seed/scout programs write small checks [heuristic] S.sequoiaSeed S.a16zAiSeed
    firstCheck: { 'pre-seed': [1e6, 3e6], seed: [1.5e6, 12e6], 'series-a': [8e6, 25e6] }, // Sequoia seed ~$1-3M, A ~$8-12M; a16z H1-2026 AI seed lead median $10.5M
    ownership: { 'pre-seed': [0.08, 0.12], seed: [0.12, 0.18], 'series-a': [0.15, 0.20] }, // Benchmark-style 15-25% at A S.benchmark; seed 8-15% [heuristic]
    reserveRatio: 0.55, portfolioPerFund: [30, 60],
    leads: 0.85, // they lead or don't play
    coldReplyRate: 0.004, // [design] ~0.3-0.5%; >99% of inbound passed S.coldReply (1-5% for VCs overall)
    warmMeetingRate: 0.30, // S.warmIntro 25-50% for warm; only from a trusted source [design]
    pedigreeWeight: 0.85, tamWeight: 0.95, tractionWeight: 0.35, // team+TAM at seed (Bernstein: experienced investors respond to team, not traction) S.bernstein
    priceSensitivity: 0.15, valuationPremium: 1.25, signal: 1.8, // [design] a16z/Sequoia lead turns rounds oversubscribed; top 3 = 48% of new fund capital S.concentration
    decisionDays: [10, 35],
    shareOfUniverse: 0.02,
    examples: ['Sequoia', 'a16z', 'Benchmark (A only)', 'Founders Fund', 'Thrive', 'Lightspeed'],
    sources: [S.concentration, S.sequoiaSeed, S.a16zAiSeed, S.benchmark, S.vcbeastMath],
  },
  established: {
    label: 'Established seed/A firm',
    fundSize: [300e6, 1e9], // mid tier S.vcbeastPlan [heuristic]
    firstCheck: { seed: [2e6, 6e6], 'series-a': [6e6, 20e6] },
    ownership: { seed: [0.10, 0.15], 'series-a': [0.15, 0.22] },
    reserveRatio: 0.55, portfolioPerFund: [25, 40],
    leads: 0.75,
    coldReplyRate: 0.01, // [design] ~1%
    warmMeetingRate: 0.35,
    pedigreeWeight: 0.6, tamWeight: 0.8, tractionWeight: 0.65, // metric bars: ARR floor, growth, NRR [heuristic]
    priceSensitivity: 0.4, valuationPremium: 1.05, signal: 1.35,
    decisionDays: [18, 50], // 3-6 week process [heuristic r2]
    shareOfUniverse: 0.07,
    examples: ['Greylock', 'Redpoint', 'Index', 'Bessemer', 'Menlo'],
    sources: [S.vcbeastPlan, S.seriesA, S.stanfordFunnel],
  },
  emerging: {
    label: 'Emerging / small fund',
    fundSize: [100e6, 300e6],
    firstCheck: { 'pre-seed': [0.5e6, 1.5e6], seed: [1.5e6, 5e6], 'series-a': [4e6, 10e6] },
    ownership: { 'pre-seed': [0.07, 0.10], seed: [0.09, 0.15], 'series-a': [0.12, 0.18] },
    reserveRatio: 0.45, portfolioPerFund: [20, 35],
    leads: 0.6,
    coldReplyRate: 0.025, // [design] ~2-3%
    warmMeetingRate: 0.42,
    pedigreeWeight: 0.55, tamWeight: 0.65, tractionWeight: 0.6,
    priceSensitivity: 0.55, valuationPremium: 0.95, signal: 1.2,
    decisionDays: [10, 40],
    shareOfUniverse: 0.20,
    examples: ['Initialized', 'Susa', 'Founder Collective', 'Lerer Hippeau'],
    sources: [S.vcbeastPlan, S.emergent, S.cartaFunds],
  },
  micro: {
    label: 'Micro-VC',
    fundSize: [25e6, 100e6],
    firstCheck: { 'pre-seed': [0.25e6, 1e6], seed: [0.4e6, 1.5e6] },
    ownership: { 'pre-seed': [0.05, 0.10], seed: [0.07, 0.12] }, // Emergent: targets 10%, median realized 12% S.emergent
    reserveRatio: 0.45, portfolioPerFund: [25, 40],
    leads: 0.4, // lead small rounds or co-lead
    coldReplyRate: 0.035, // [design] micro 3-8% per r2 collapsed toward the lower end for a decent cold email
    warmMeetingRate: 0.5,
    pedigreeWeight: 0.45, tamWeight: 0.5, tractionWeight: 0.55,
    priceSensitivity: 0.75, valuationPremium: 0.85, signal: 1.1,
    decisionDays: [7, 30],
    shareOfUniverse: 0.30,
    examples: ['Homebrew', 'Precursor', 'Hustle Fund'],
    sources: [S.vcbeastBets, S.emergent, S.firstTimeFunds],
  },
  nano: {
    label: 'Nano fund / solo GP',
    fundSize: [2e6, 25e6],
    firstCheck: { 'pre-seed': [50e3, 250e3], seed: [75e3, 300e3] },
    ownership: { 'pre-seed': [0.02, 0.06], seed: [0.02, 0.08] }, // followers, SAFE-with-cap, no lead [heuristic]
    reserveRatio: 0.15, portfolioPerFund: [30, 70],
    leads: 0.1,
    coldReplyRate: 0.045, // [design] ~4-5%
    warmMeetingRate: 0.55,
    pedigreeWeight: 0.35, tamWeight: 0.35, tractionWeight: 0.5,
    priceSensitivity: 0.8, valuationPremium: 0.8, signal: 1.0,
    decisionDays: [3, 21],
    shareOfUniverse: 0.24,
    examples: ['solo-GP funds', 'scout-style micro funds'],
    sources: [S.vcbeastBets, S.firstTimeFunds],
  },
  cvc: {
    label: 'Corporate VC',
    fundSize: [50e6, 1.5e9],
    firstCheck: { seed: [0.5e6, 3e6], 'series-a': [2e6, 10e6] },
    ownership: { seed: [0.02, 0.08], 'series-a': [0.04, 0.12] }, // strategic, rarely lead
    reserveRatio: 0.3, portfolioPerFund: [20, 60],
    leads: 0.15,
    coldReplyRate: 0.015, // [design]
    warmMeetingRate: 0.3,
    pedigreeWeight: 0.3, tamWeight: 0.55, tractionWeight: 0.7, // want customers/integration proof [heuristic]
    priceSensitivity: 0.3, valuationPremium: 1.0, signal: 1.0,
    decisionDays: [30, 120], // slow, strategic sign-off [heuristic r2]
    shareOfUniverse: 0.06,
    examples: ['enterprise-software corporate arms'],
    sources: ['https://news.crunchbase.com/venture/corporate-vc-splitting-paypal-fidelity-brotman-alpha/'],
  },
  family_office: {
    label: 'Family office',
    fundSize: [50e6, 2e9],
    firstCheck: { 'pre-seed': [100e3, 500e3], seed: [250e3, 2e6], 'series-a': [1e6, 5e6] },
    ownership: { seed: [0.01, 0.05], 'series-a': [0.02, 0.06] },
    reserveRatio: 0.2, portfolioPerFund: [10, 40],
    leads: 0.1,
    coldReplyRate: 0.02, // [design] opportunistic, sentiment-driven
    warmMeetingRate: 0.4,
    pedigreeWeight: 0.5, tamWeight: 0.45, tractionWeight: 0.45,
    priceSensitivity: 0.4, valuationPremium: 1.0, signal: 1.0,
    decisionDays: [14, 90],
    shareOfUniverse: 0.05,
    examples: ['single-family offices investing directly'],
    sources: ['https://techcrunch.com/2026/09/18/family-offices-are-clamoring-for-ai-investments/'],
  },
  crossover: {
    label: 'Crossover / growth fund',
    fundSize: [2e9, 15e9],
    firstCheck: { seed: [8e6, 40e6], 'series-a': [15e6, 80e6] }, // come down-stage mainly for AI at high prices [heuristic r2]
    ownership: { seed: [0.05, 0.12], 'series-a': [0.06, 0.15] },
    reserveRatio: 0.3, portfolioPerFund: [30, 80],
    leads: 0.6,
    coldReplyRate: 0.003, // [design]
    warmMeetingRate: 0.22,
    pedigreeWeight: 0.7, tamWeight: 1.0, tractionWeight: 0.7,
    priceSensitivity: 0.05, valuationPremium: 1.5, signal: 1.5,
    decisionDays: [7, 30],
    shareOfUniverse: 0.03,
    examples: ['growth/crossover funds buying early AI rounds'],
    sources: [S.pbq2, S.pbq1],
  },
  indie: {
    label: 'Indie / bootstrapper fund',
    fundSize: [8e6, 30e6], // TinySeed Fund 4 is $16M S.tinyseed
    firstCheck: { 'pre-seed': [50e3, 200e3], seed: [100e3, 500e3] }, // TinySeed ~$120K+; Earnest/Calm $30-200K S.earnest [unverified]
    ownership: { 'pre-seed': [0.05, 0.12], seed: [0.05, 0.12] }, // TinySeed 10-12% equity, no board [low-confidence secondary]
    reserveRatio: 0.2, portfolioPerFund: [40, 80],
    leads: 0.3,
    coldReplyRate: 0.05, // [design] open application funnels
    warmMeetingRate: 0.5,
    pedigreeWeight: 0.15, tamWeight: 0.0, tractionWeight: 0.95, // like profitable capped SaaS; dislike moonshot burn
    priceSensitivity: 0.7, valuationPremium: 0.8, signal: 1.0,
    decisionDays: [14, 60],
    shareOfUniverse: 0.03,
    examples: ['TinySeed', 'Earnest Capital', 'Calm Fund (status unclear)'],
    sources: [S.tinyseed, S.earnest, 'https://calmfund.com/what-we-invest-in'],
  },
};

// Angels have no fund-returner math. Check sizes in USD.
// followRate = P(joins when a credible lead exists); fomoWeight = pull of who-else-is-in.
export const ANGEL_TIERS = {
  super_angel: { label: 'Super angel', check: [100e3, 1e6], followRate: 0.5, pedigreeWeight: 0.8, fomoWeight: 0.5, coldReplyRate: 0.01, warmMeetingRate: 0.3, shareOfUniverse: 0.01, sources: ['https://www.roundfunded.com/en/blogs/top-angel-investors-usa-2026'] }, // $250K-$1M+ third-party estimates [unverified]
  operator: { label: 'Operator angel', check: [10e3, 50e3], followRate: 0.6, pedigreeWeight: 0.4, fomoWeight: 0.45, coldReplyRate: 0.06, warmMeetingRate: 0.55, shareOfUniverse: 0.30, sources: [S.cartaAngelCheck] }, // pre-seed median check fell $50K -> $30K (Carta, 2023)
  first_time: { label: 'First-time angel', check: [5e3, 25e3], followRate: 0.7, pedigreeWeight: 0.5, fomoWeight: 0.8, coldReplyRate: 0.04, warmMeetingRate: 0.5, shareOfUniverse: 0.45, sources: [S.unh] }, // median individual ~$25K; 422k active angels (UNH)
  syndicate: { label: 'Syndicate lead', check: [50e3, 250e3], followRate: 0.4, pedigreeWeight: 0.45, fomoWeight: 0.6, coldReplyRate: 0.03, warmMeetingRate: 0.4, shareOfUniverse: 0.05, sources: ['https://angelinvestorsnetwork.com/angel-investing/the-20-most-active-angel-groups-in-america-q1-2026-rankings-'] }, // pool $50-150K per deal [unverified]
  angel_group: { label: 'Angel group', check: [100e3, 400e3], followRate: 0.3, pedigreeWeight: 0.3, fomoWeight: 0.35, coldReplyRate: 0.035, warmMeetingRate: 0.4, shareOfUniverse: 0.1, sources: ['https://angelcapitalassociation.org/blog/aca-publishes-2026-angel-funders-report/'] }, // avg group deal ~$267K (dated ACA)
  scout: { label: 'Scout', check: [25e3, 250e3], followRate: 0.2, pedigreeWeight: 0.7, fomoWeight: 0.3, coldReplyRate: 0.02, warmMeetingRate: 0.45, shareOfUniverse: 0.09, sources: ['https://techcrunch.com/2019/06/07/a-peek-inside-sequoia-capitals-low-flying-wide-reaching-scout-program'] }, // [design] a good scout check is a signal to the parent fund
};

// Share of ENTRY ownership lost between entry stage and exit (cumulative later rounds + pool refreshes).
// Derived: ~0.82^n retained (median round dilutes ~18-20%, Carta) -> seed->A->B->C->exit retains ~45-50% S.cartaRounds [design arithmetic].
export const DILUTION_TO_EXIT = { 'pre-seed': 0.6, seed: 0.5, 'series-a': 0.4 };

// Exit EV / ARR at exit. Private bootstrapped ~4.8x, VC-backed ~5.3x median, small deals 2.5-4x S.saasCapital S.acquire; AI premium bands [heuristic].
export const EXIT_MULTIPLE_ARR = { capped: [3, 6], mid: [5, 10], venture: [8, 15], ai: [10, 25] };

// Market ceiling classes: ARR a WINNER can plausibly reach. Venture test: credible path to ~$100M ARR in ~7 years S.lemkinTam.
export const SCALE_CLASSES = {
  micro: { label: 'micro-SaaS / niche tool', ceilingArr: [0.3e6, 3e6] },
  lifestyle: { label: 'small vertical / SMB niche', ceilingArr: [3e6, 15e6] },
  mid: { label: 'mid-market category', ceilingArr: [15e6, 80e6] },
  venture: { label: 'venture-scale category', ceilingArr: [80e6, 400e6] },
  moonshot: { label: 'platform / moonshot', ceilingArr: [400e6, 3e9] },
};
export const SCALE_ORDER = ['micro', 'lifestyle', 'mid', 'venture', 'moonshot'];

// Regexes run on oneLiner + icp. cap = MAX class; floor = MIN class (boosters). Caps win over boosters; the deck can't override a cap. [design] / [heuristic]
// Platform-dependent small-ticket products are capped (r4 sec 5; Lemkin small-TAM S.lemkinSmallTam).
export const SCALE_SIGNALS = [
  { re: /chrome extension|browser extension|browser add-?on/i, cap: 'micro', why: 'Browser extensions are platform-capped, low-ticket products' },
  { re: /shopify app|shopify plugin|woocommerce (plugin|app)/i, cap: 'lifestyle', why: 'Single-marketplace apps are capped by the platform and its price points' },
  { re: /wordpress plugin|wp plugin/i, cap: 'micro', why: 'WordPress plugins sell cheap and commoditise fast' },
  { re: /figma plugin|notion (template|plugin)|slack (bot|app) for|obsidian plugin|zapier (app|integration)/i, cap: 'micro', why: 'A plugin for someone else\'s platform is a feature, not a category' },
  { re: /\btemplates?\b|\bnotion template|spreadsheet template/i, cap: 'micro', why: 'Templates are a one-time purchase, not venture-scale recurring revenue' },
  { re: /for (freelancers?|solopreneurs?|creators?|side[- ]hustlers?|bloggers?)\b/i, cap: 'lifestyle', why: 'Solo customers pay small tickets and churn at high rates' },
  { re: /\b(local|single[- ]city|neighbou?rhood|city[- ]specific|in my (town|city))\b/i, cap: 'micro', why: 'A single-city market cannot reach venture scale' },
  { re: /\b(hobby|hobbyists?|collectors?|fantasy|gardening|knitting|crochet|aquarium|bird ?watch|sneakerheads?)\b/i, cap: 'micro', why: 'Niche hobby audiences have small, low-spend markets' },
  { re: /for (dog groomers|groomers|yoga (studios|teachers)|dentists|chiropractors|salons?|barbers?|florists|photographers|wedding planners|plumbers|electricians|landscapers|tattoo|pet (sitters|owners)|tutors|personal trainers|hair|barbershops)/i, cap: 'lifestyle', why: 'A single small vertical is a good business but a capped one (<$30M ARR) unless payments or a marketplace layer is added' },
  { re: /\b(side project|weekend project|indie hacker|micro-?saas|one[- ]person|solo[- ]built)\b/i, cap: 'lifestyle', why: 'Self-described micro-SaaS positioning signals a lifestyle ceiling to investors' },
  { re: /\bwrapper (around|for|on)\b|\bchatgpt wrapper|gpt wrapper\b/i, cap: 'mid', why: 'Thin model wrappers carry platform risk and are distrusted without a moat' },
  { re: /\binfrastructure\b|\binfra for\b/i, floor: 'mid', why: 'Infrastructure sells to many companies and expands with usage' },
  { re: /\bplatform\b|\bmarketplace (for|of|connecting)\b|\bnetwork effects?\b/i, floor: 'mid', why: 'Platforms and networks can expand the addressable market' },
  { re: /operating system for|\bos for\b|system of record/i, floor: 'venture', why: 'Systems of record become the center of a workflow and expand' },
  { re: /agents? that (replace|do the work of|automate)|replace(s)? (the )?(\w+ ){0,2}(team|staff|analysts?|sdrs?|agencies)|services[- ]as[- ]software|autonomous agents?/i, floor: 'venture', why: 'Agents that replace labor address labor spend, not software spend (hot thesis in 2026)' },
  { re: /\benterprise\b|fortune ?500|global 2000|\bregulated industr/i, floor: 'mid', why: 'Enterprise buyers pay large contracts and expand' },
  { re: /\bpayments?\b|embedded (finance|lending|payments)|\bfintech\b|take rate/i, floor: 'mid', why: 'A payments or take-rate layer scales revenue with customer volume' },
  { re: /(any|every|all) (company|business|team|industry)|horizontal|\bacross industries\b/i, floor: 'mid', why: 'Horizontal products address any company, which widens the market' },
  { re: /\b(foundation|frontier|large language) models?\b|\bgpu\b|\bcompute (cloud|marketplace)\b|\binference (engine|platform)\b/i, floor: 'venture', why: 'Model and compute infrastructure is the highest-ceiling AI bet' },
];

// 2026 heat: investor appetite multiplier 0.6..1.4. share = share of specialist funds [design] (r4 sec 2).
// Hot: AI, defense, cyber (PitchBook: AI = 86% of H1-2026 US deal value S.pbq2; cyber >$18B 2025 +26%; defense 2.4x S.crunchbaseSectors).
export const SECTORS = [
  { id: 'ai_infra', label: 'AI infrastructure / models', keywords: ['llm', 'inference', 'gpu', 'foundation model', 'vector', 'model serving', 'eval', 'fine-tuning', 'mlops', 'embedding'], heat: 1.4, aiNative: true, share: 0.09, metricsNote: 'Technical team, compute moat, lab pedigree; revenue optional at the top end', sources: [S.pbq2] },
  { id: 'ai_agents', label: 'AI apps / agents', keywords: ['agent', 'agents', 'copilot', 'ai-native', 'automation', 'autonomous', 'assistant', 'workflow automation', 'generative'], heat: 1.35, aiNative: true, share: 0.13, metricsNote: '$1M+ ARR fast, usage growth, outcome pricing; wrappers distrusted', sources: [S.pbq2, S.waveup] },
  { id: 'devtools', label: 'Developer tools / infra', keywords: ['developer', 'api', 'sdk', 'open source', 'ci/cd', 'observability', 'devops', 'code review', 'database', 'cli'], heat: 1.15, aiNative: false, share: 0.08, metricsNote: 'OSS traction, bottoms-up usage, expansion', sources: ['r4'] },
  { id: 'cyber', label: 'Cybersecurity', keywords: ['security', 'soc', 'compliance automation', 'identity', 'threat', 'vulnerability', 'ciso', 'zero trust', 'phishing', 'siem'], heat: 1.3, aiNative: false, share: 0.06, metricsNote: 'CISO design partners; cyber VC >$18B in 2025 (+26%)', sources: [S.crunchbase2025] },
  { id: 'defense', label: 'Defense / dual-use', keywords: ['defense', 'defence', 'national security', 'dual-use', 'drone', 'space', 'military', 'dod', 'aerospace'], heat: 1.3, aiNative: false, share: 0.05, metricsNote: 'Government pilots, founder pedigree; defense tech 2.4x YoY (narrow Crunchbase def)', sources: [S.crunchbaseSectors] },
  { id: 'fintech', label: 'Fintech', keywords: ['payments', 'lending', 'banking', 'treasury', 'invoicing', 'accounting', 'billing', 'credit', 'insurance', 'embedded finance'], heat: 1.0, aiNative: false, share: 0.08, metricsNote: 'Regulatory handling, take rate; $51.8B in 2025 (+27%) but below peak', sources: [S.crunchbase2025] },
  { id: 'healthtech', label: 'Healthtech / bio', keywords: ['health', 'clinic', 'patient', 'ehr', 'hipaa', 'medical', 'care', 'pharma', 'telehealth', 'payer'], heat: 1.05, aiNative: false, share: 0.09, metricsNote: 'Clinical or payer proof; long sales cycles', sources: ['r4'] },
  { id: 'vertical_saas', label: 'Vertical SaaS', keywords: ['construction', 'logistics', 'trucking', 'restaurant', 'field service', 'property', 'contractors', 'manufacturing', 'vertical', 'industry-specific'], heat: 1.0, aiNative: false, share: 0.08, metricsNote: '$1-2M ARR, NRR>100%, payback <18 months; embedded payments help', sources: ['r4'] },
  { id: 'horizontal_saas', label: 'Horizontal B2B SaaS', keywords: ['b2b', 'saas', 'crm', 'analytics', 'collaboration', 'productivity', 'project management', 'sales', 'marketing', 'customer success'], heat: 0.9, aiNative: false, share: 0.07, metricsNote: 'Needs $100M ARR path; crowded, AI incumbents ship features', sources: ['r1'] },
  { id: 'hr', label: 'HR / future of work', keywords: ['hiring', 'recruiting', 'payroll', 'hr', 'talent', 'onboarding', 'workforce', 'employee'], heat: 0.85, aiNative: false, share: 0.03, metricsNote: 'Niche ARR proof; cyclical with hiring', sources: ['r4'] },
  { id: 'legal', label: 'Legal tech', keywords: ['legal', 'law firm', 'contracts', 'compliance', 'paralegal', 'e-discovery', 'attorney'], heat: 1.1, aiNative: false, share: 0.03, metricsNote: 'AI services-as-software tailwind; labor-spend TAM', sources: [S.crunchbaseSectors] },
  { id: 'govtech', label: 'GovTech / civic', keywords: ['government', 'municipal', 'public sector', 'city', 'procurement', 'k-12', 'permits', 'civic'], heat: 0.85, aiNative: false, share: 0.02, metricsNote: 'Long procurement; budget-cycle timing', sources: ['r4'] },
  { id: 'proptech', label: 'Proptech / real estate', keywords: ['real estate', 'landlord', 'tenant', 'property management', 'mortgage', 'brokerage', 'leasing'], heat: 0.8, aiNative: false, share: 0.03, metricsNote: 'Rate-sensitive; cooler since 2022', sources: ['r4'] },
  { id: 'edtech', label: 'Edtech', keywords: ['education', 'school', 'student', 'learning', 'course', 'teacher', 'tutoring', 'university'], heat: 0.65, aiNative: false, share: 0.02, metricsNote: 'Below peak; slow budget cycles', sources: [S.crunchbase2025] },
  { id: 'climate', label: 'Climate / energy', keywords: ['climate', 'carbon', 'energy', 'solar', 'battery', 'grid', 'sustainability', 'emissions', 'ev charging'], heat: 0.75, aiNative: false, share: 0.05, metricsNote: 'Pilots and offtake; $42.2B in 2025, well below peak', sources: ['r4 (PitchBook summary)'] },
  { id: 'marketplaces', label: 'Marketplaces', keywords: ['marketplace', 'two-sided', 'supply', 'demand', 'buyers and sellers', 'gig', 'booking'], heat: 0.8, aiNative: false, share: 0.03, metricsNote: 'Liquidity and take rate; capital intensive', sources: ['r4'] },
  { id: 'consumer', label: 'Consumer / social', keywords: ['consumer', 'social', 'app for', 'dating', 'community', 'creator', 'gaming', 'subscription app', 'fitness', 'wellness'], heat: 0.6, aiNative: false, share: 0.03, metricsNote: 'Retention curves; high churn; a few funds only', sources: ['r4'] },
  { id: 'ecommerce_tools', label: 'E-commerce tools', keywords: ['ecommerce', 'e-commerce', 'shopify', 'merchant', 'dtc', 'checkout', 'storefront', 'retail', 'returns'], heat: 0.8, aiNative: false, share: 0.03, metricsNote: 'Platform-dependent; payments layer lifts ceiling', sources: ['r4'] },
  { id: 'generalist', label: 'Generalist', keywords: [], heat: 1.0, aiNative: false, share: 0, metricsNote: 'Any sector; founder-first (generalist funds are drawn separately via THESIS_TEMPLATES.generalist, not from this share)', sources: ['r4'] },
];

// share of VC firms by region [design], loosely from the US-weighted universe (NVCA counts US firms only).
export const GEOS = [
  { id: 'us_sf', label: 'SF Bay Area', share: 0.26 },
  { id: 'nyc', label: 'New York', share: 0.14 },
  { id: 'us_other', label: 'Other US (LA, Austin, Boston, Miami, Midwest)', share: 0.22 },
  { id: 'europe_uk', label: 'Europe / UK', share: 0.16 },
  { id: 'india', label: 'India', share: 0.05 },
  { id: 'sea', label: 'Southeast Asia', share: 0.04 },
  { id: 'latam', label: 'Latin America', share: 0.03 },
  { id: 'mena_africa', label: 'Middle East / Africa', share: 0.03 },
  { id: 'canada_anz', label: 'Canada / Australia / NZ', share: 0.04 },
  { id: 'global', label: 'Global / remote-first', share: 0.03 },
];

// Paraphrased thesis templates [heuristic wording, not quotes]. Tokens: {sector} {stage} {geo} {check}.
export const THESIS_TEMPLATES = {
  generalist: [
    'We back exceptional founders at {stage} across sectors, writing {check} first checks.',
    'Sector-agnostic {stage} fund: strong team, big market, {check} to start.',
    'We lead {stage} rounds for software companies in {geo} with a clear path to a category leader.',
    'First-check capital at {stage}, any industry, bias toward fast-shipping technical teams.',
    'We invest in {geo} founders at {stage} who can explain why now and why them.',
    'Concentrated {stage} bets: a handful of new companies a year, {check} initial checks.',
  ],
  sector: [
    'We invest in {sector} companies at {stage} and write {check} first checks.',
    'A {stage} fund focused on {sector}, led by former operators in the space.',
    '{sector} specialists: we lead {stage} rounds and help with the first ten customers.',
    'Our whole thesis is {sector} at {stage}; we pass quickly on anything outside it.',
    'We back {sector} founders in {geo} with unfair insight into the buyer.',
    'Deep {sector} network: intros to design partners, hires and follow-on investors at {stage}.',
  ],
  founder_first: [
    'We back people before ideas: repeat or technical founders at {stage}, {check} checks.',
    'Founders who have built and sold before get our fastest decisions at {stage}.',
    'We invest in unusually driven builders at {stage}, often before a product exists.',
    'Team first: we bet on founders with an unfair advantage in {sector} at {stage}.',
    'Ex-operators and researchers at {stage}; we decide on the founder, then the market.',
    'We pre-empt for exceptional {geo} founders and let the idea evolve.',
  ],
  contrarian: [
    'We back unfashionable {sector} markets that bigger funds ignore, at {stage}.',
    'Boring, cash-flowing niches at {stage}: compliance, field services, back office.',
    'We prefer capital-efficient companies at {stage} that could be profitable before the next round.',
    'While the crowd chases hype we write {check} checks into durable {sector} businesses.',
    'We like markets everyone calls small, if the unit economics are excellent, at {stage}.',
    'Out-of-consensus {stage} bets in {geo}, with real revenue as the entry ticket.',
  ],
  ai_native: [
    'AI-native {sector} companies at {stage}; we do not fund thin wrappers.',
    'We back technical founders building AI infrastructure and agents at {stage}, {check} checks.',
    'AI agents replacing services labor in {sector}, with outcome-based pricing, at {stage}.',
    'We invest at {stage} when the product gets better with usage independent of the base model.',
    'Applied AI for {sector}: evals, proprietary data and fast revenue are what we look for.',
    '{stage} fund for AI-first teams in {geo}; small teams, high revenue per employee.',
  ],
  bootstrapper: [
    'Capital for profitable software businesses that do not want a traditional VC round; revenue-share repayment.',
    'We fund indie SaaS founders at {stage} with {check} and keep you in control.',
    'Seed-strapping: small checks, no board seat, a path to profitability in {sector}.',
    'We invest in capped-but-cash-flowing SaaS where founders want options, not blitzscaling.',
    'Shared-earnings and founder-friendly terms for B2B SaaS with $500+ MRR.',
    'For bootstrapped founders in {sector}: capital, community and a calm path to default-alive.',
  ],
};

// Fictional only. Never real firm names. {a} + {b.fund} builds "Larch Ventures"; people from first + last.
export const NAME_PARTS = {
  a: ['Alder', 'Aspen', 'Birch', 'Basalt', 'Cedar', 'Cobalt', 'Cinder', 'Cypress', 'Delta', 'Dune', 'Elm', 'Ember', 'Fern', 'Flint', 'Fjord', 'Gale', 'Garnet', 'Glen', 'Harbor', 'Hazel', 'Heron', 'Indigo', 'Iris', 'Ivory', 'Juniper', 'Kestrel', 'Kelp', 'Larch', 'Lark', 'Lichen', 'Linden', 'Lumen', 'Maple', 'Marlin', 'Mesa', 'Moss', 'Nimbus', 'Nettle', 'Oak', 'Onyx', 'Orchard', 'Osprey', 'Pine', 'Pebble', 'Plover', 'Quarry', 'Quill', 'Raven', 'Reed', 'Ridge', 'Rowan', 'Sable', 'Sage', 'Saltmarsh', 'Sequoyah', 'Slate', 'Sorrel', 'Sparrow', 'Spruce', 'Summit', 'Tamarack', 'Tern', 'Thistle', 'Tidewater', 'Timber', 'Tundra', 'Umber', 'Vale', 'Vesper', 'Willow', 'Wren', 'Yarrow', 'Zenith', 'Zephyr', 'Meridian', 'Vector', 'Axiom', 'Prism', 'Cairn', 'Beacon', 'Keystone', 'Lodestar', 'Parallax', 'Quorum', 'Tessera', 'Anvil', 'Foundry', 'Atlas', 'Ballast'],
  b: {
    fund: ['Ventures', 'Capital', 'Partners', 'VC', 'Fund', 'Labs', 'Growth', 'Equity'],
    angel: ['(individual)'],
    cvc: ['Strategic Ventures', 'Corporate Ventures', 'Innovation Fund', 'Investments'],
    fo: ['Family Office', 'Holdings', 'Private Capital', 'Legacy Partners'],
  },
  first: ['Avery', 'Blake', 'Camille', 'Dario', 'Elena', 'Farah', 'Gideon', 'Hana', 'Idris', 'Jonah', 'Keiko', 'Lena', 'Mateo', 'Nadia', 'Omar', 'Priya', 'Quentin', 'Rosa', 'Sanjay', 'Talia', 'Uri', 'Vera', 'Wes', 'Ximena', 'Yusuf', 'Zoe', 'Anders', 'Beatriz', 'Chidi', 'Dara', 'Esme', 'Felix', 'Greta', 'Hugo', 'Imani', 'Jasper', 'Kai', 'Leila', 'Marcus', 'Noor'],
  last: ['Abbott', 'Brennan', 'Castillo', 'Dalton', 'Everhart', 'Fontaine', 'Gallagher', 'Hartwell', 'Ibarra', 'Jansen', 'Kowalski', 'Lindqvist', 'Moreau', 'Nakamura', 'Okafor', 'Petrov', 'Quinlan', 'Rahman', 'Sorensen', 'Takahashi', 'Underhill', 'Varga', 'Whitlock', 'Xu', 'Yilmaz', 'Zamora', 'Achterberg', 'Bhatt', 'Calloway', 'Desai', 'Eriksen', 'Faulkner', 'Gutierrez', 'Holloway', 'Iyer', 'Kessler', 'Lombardi', 'Mbeki', 'Novak', 'Oyelaran'],
};

// Population sizes. Playable universe is a scaled sample; counts shown to players use these.
export const UNIVERSE_COUNTS = {
  us_vc_firms: 2984, // NVCA 2026 Yearbook; first-ever decline from 3,054 (S.nvca2026)
  us_vc_firms_prior: 3054,
  angels_active: 422350, // UNH Center for Venture Research, 2023 (S.unh, secondary)
  angel_groups_us: 220, // ACA, 2014 figure; older [dated]
  database_listed_investors: 16600, // OpenVC claimed ~16.6k VCs/angels/FOs/accelerators (2026, aggregator claim)
  active_seed_funds: 1200, // [design] ~40% of US firms actively write seed/pre-seed checks
  global_vc_firms_est: 9000, // [design] scaling US count for Europe/Asia/other; no audited source
  new_first_time_funds_yr: 15, // June-2026 Form D: only 15 genuine first-time managers raising >=$10M (S.firstTimeFunds)
  sources: [S.nvca2026, S.unh, S.firstTimeFunds],
};

// Pedigree: team info moves investors most (Bernstein et al., J. Finance 2017, ~17,000 emails: S.bernstein).
// Prior SUCCESS helps (30% vs ~20% IPO/file rate), prior failure does not (Gompers et al., JFE 2010: S.gompers2010).
// Repeat founders: >50% of seed+A dollars with ~40% of rounds (Carta 2025: S.cartaRepeat) -> ~1.5x relative dollars per round.
// Top schools: ~25% of US seed/pre-seed dollars to Stanford/Harvard/MIT alumni (S.crunchbaseSchools). Same-industry experience predicts success (S.azoulay).
// Points, tiers, and multipliers below are [design] calibrations to those effect sizes. Regexes use \b to avoid false hits.
export const PEDIGREE = {
  signals: [
    { id: 'exit', re: /\b(acquired by|was acquired|got acquired|sold (my|our|the|a) (\w+ ){0,2}(company|startup|business)|(successful )?exit(ed)?\b|ipo\b|went public)/i, points: 2, label: 'Prior exit' },
    { id: 'repeat', re: /\b(serial (founder|entrepreneur)|second[- ]time (founder|entrepreneur)|(third|2nd|3rd)[- ]time founder|previously (founded|started|built) (a|an|two|three|\d)|founded (and )?(scaled|grew|built) (a|an) )/i, points: 1, label: 'Repeat founder' },
    { id: 'elite_school', re: /\b(stanford|harvard|massachusetts institute of technology|mit|caltech|carnegie mellon|cmu|oxford|cambridge university|university of cambridge|eth zurich|princeton|berkeley|yale)\b/i, points: 1, label: 'Elite school' },
    { id: 'ai_lab', re: /\b(openai|anthropic|deepmind|google brain|meta ai|fair at meta|mistral ai|xai|nvidia research|microsoft research)\b/i, points: 1.5, label: 'Ex-AI-lab' },
    { id: 'bigtech', re: /\b(google|alphabet|meta|facebook|apple|amazon|aws|microsoft|netflix|stripe|airbnb|uber|salesforce|snowflake|databricks|palantir|figma)\b/i, points: 0.5, label: 'Big tech / unicorn alum' },
    { id: 'yc', re: /\by ?combinator\b|\byc\b ?(?:[wsfx]\d{2}|alum|alumni|batch)|\bycombinator\b|\btechstars\b|\bantler\b|\bentrepreneur first\b/i, points: 1, label: 'Top accelerator' },
    { id: 'unicorn_early', re: /\b(employee (number |#)?\d{1,3}|early (employee|team member)|founding (engineer|team|member)|first (\d+ )?(engineers?|hires?) at|joined (at )?(seed|series a))\b/i, points: 1, label: 'Early at a breakout company' },
    { id: 'phd', re: /\bph\.?d\b|\bdoctorate\b|\bpublished (research|papers?)\b/i, points: 0.5, label: 'PhD / published research' },
    { id: 'domain', re: /\b(1[0-9]|2[0-9]|[89])\+? years? (of )?(experience )?(in|at|working|as)\b|\bformer (cto|ceo|vp|head of|director)\b|\bex-(cto|ceo|vp|head)\b/i, points: 1, label: 'Deep domain experience' },
    { id: 'traction_public', re: /\b(grew|scaled) .{0,40}\$\d+(\.\d+)?\s?(m|million|k)\b|\b(top[- ]\d+ (product hunt|github))\b/i, points: 0.5, label: 'Verifiable past traction' },
  ],
  tiers: [
    { min: 0, id: 'none' },
    { min: 1, id: 'some' },
    { min: 2.5, id: 'strong' },
    { min: 4, id: 'elite' },
  ],
  // [design] multipliers. meetingMult on P(meeting), roundMult on round size, valuationMult on price. 'strong' ~ repeat founder or ex-lab + elite school.
  // Calibration: repeat founders get ~1.25x the dollars per round vs their round share (50%/40%); exit + lab + school stacks to 'elite'.
  meetingMult: { none: 1, some: 1.2, strong: 1.8, elite: 3 },
  roundMult: { none: 1, some: 1.1, strong: 1.4, elite: 2.5 },
  valuationMult: { none: 1, some: 1.05, strong: 1.25, elite: 1.8 },
  failedFounderPenalty: 0, // prior failure is neutral, not positive (Gompers 2010); no bonus either
  soloMult: { meeting: 0.75, roundDollars: 0.6 }, // 14.7% of cash to ~30% of startups (Carta solo report: S.cartaSolo) -> ~0.5; softened [design]
  sources: [S.bernstein, S.gompers2010, S.cartaRepeat, S.crunchbaseSchools, S.crunchbaseSchools2026, S.azoulay, S.ggks],
};

// AI era (2026). Conflicting evidence on the seed premium: Carta 2024 data ~42% pre-money, early-2025 $19M vs $13M (~+45%);
// PitchBook-NVCA Q1 2026 shows only ~4% (S.aiSeedPremium). We use 1.4x as the headline and apply it only to genuinely AI-native decks [design].
export const AI_ERA = {
  aiValuationPremium: 1.4, // seed; range 1.04-1.45 across sources
  aiValuationPremiumRange: [1.04, 1.45],
  aiSeriesAPremium: 1.38, // Carta 2025 via secondary [unverified]
  aiShareOfDollars: 0.86, // H1 2026 US VC deal value (PitchBook-NVCA via S.pbq2)
  aiShareOfDollarsCarta: 0.6, // Carta platform Q1 2026 (secondary)
  megaDealShareOfDollars: 0.875, // rounds >= $100M share of H1-2026 deal value (S.pbq1)
  medianSeedPost: 24.3e6, // Carta software seed median post, Jul 2026 (secondary, S.waveup)
  aiAppsSeedMedian: { raise: 4.5e6, pre: 20e6 }, // Carta Oct 2025, 1,208 US rounds
  // Pedigreed + huge TAM can raise a mega-seed pre-revenue: rare (top 1-3% of rounds). Real mega seeds are $1-2B (S.megaSeeds S.amiLabs) but are lab-scale outliers;
  // the $8-30M at $40-150M post band is a [design] for pedigreed app-layer founders (r2 sec 6 [heuristic]).
  megaSeed: { minPedigree: 'elite', minScale: 'moonshot', round: [8e6, 30e6], post: [40e6, 150e6], oddsCap: 0.03 },
  sources: [S.pbq2, S.aiSeedPremium, S.waveup, S.megaSeeds, S.amiLabs],
};

// Funnel and fund-returner behaviour constants [design] unless sourced.
export const DECISION_RULES = {
  returnerRatioSoft: 0.6, // ratio (plausible exit / needed exit) below this lowers interest
  returnerRatioHard: 0.3, // below this, institutional funds pass at partner stage ("great business, not venture-backable")
  allocationFloor: 0.7, // if offered allocation < 70% of the check needed for target ownership, flip to pass or demand more
  seedDilutionDislike: 0.30, // investors dislike founders selling >30% at seed; <10% of seeds do (Carta: S.cartaSeedDilution)
  conversionFunnel: 0.01, // ~1% of inbound becomes an investment (S.stanfordFunnel)
  warmVsCold: [3, 5], // warm intro lifts reply 3-5x (S.warmIntro, vendor blog)
  sources: [S.cartaSeedDilution, S.stanfordFunnel, S.warmIntro, S.vcbeastMath],
};
