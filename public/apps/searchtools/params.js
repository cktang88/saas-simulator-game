// Search & AI visibility: tool catalog, measurement error, GEO (AI answer visibility) parameters and action hours.
// Research: docs/research/seo/llm-visibility.md (GEO audit, tactics, tools, game-ready parameters),
// docs/research/seo/effects-and-risks.md §8 (tool accuracy), docs/research/seo/indie.md and seed-series-a.md
// (stacks and prices by stage). Prices are vendor list prices summarised by aggregators in 2026 [unverified: check
// the vendor page]. Everything marked [design] is a tuning estimate for the simulator, never a real statistic.

// ---------------- Tools ----------------
// kind: gsc (first-party Google data) | bing | awt (Ahrefs Webmaster Tools, own site only) | planner (ranges only)
//       | grader (one-off AI visibility score) | keyword (Ahrefs/Semrush suites) | crawler | optimizer | tracker
// price: monthly USD (0 = free). annual: billed yearly, amortised monthly like the default stack's domains.
// setup: founder hours to connect / verify / learn the tool [design].
export const TOOLS = {
  gsc: { label: 'Google Search Console', vendor: 'Google Search Console', kind: 'gsc', price: 0, setup: 0.5, note: 'Free. True clicks, impressions, CTR and position for YOUR site, Google only, ~2-3 day lag, anonymised queries left out.' },
  bing: { label: 'Bing Webmaster Tools', vendor: 'Bing Webmaster Tools', kind: 'bing', price: 0, setup: 0.25, note: 'Free; imports from Search Console. Bing\'s index also feeds ChatGPT search and Copilot.' },
  awt: { label: 'Ahrefs Webmaster Tools', vendor: 'Ahrefs Webmaster Tools', kind: 'awt', price: 0, setup: 0.5, needs: 'gsc', note: 'Free for your own verified site: site audit, backlinks, the keywords you rank for (estimated). No keyword research for other queries.' },
  planner: { label: 'Google Keyword Planner', vendor: 'Google Ads Keyword Planner', kind: 'planner', price: 0, setup: 0.5, note: 'Free with a Google Ads account. Without active ad spend it shows only broad volume ranges (e.g. 100-1K) and no difficulty.' },
  grader: { label: 'HubSpot AI Search Grader', vendor: 'HubSpot AI Search Grader', kind: 'grader', price: 0, setup: 0.25, oneOff: true, note: 'Free, one-off 0-100 score from a handful of single runs on ChatGPT, Perplexity and Gemini. A first look, not a measurement.' },
  ahrefs_lite: { label: 'Ahrefs Lite', vendor: 'Ahrefs', plan: 'Lite', kind: 'keyword', engine: 'ahrefs', price: 129, setup: 1.5, brandRadarPrompts: 5, note: '$129/mo ($108 annual). Keyword volume/KD, competitor traffic estimates, rank tracking. Brand Radar custom prompts: 5.' },
  ahrefs_standard: { label: 'Ahrefs Standard', vendor: 'Ahrefs', plan: 'Standard', kind: 'keyword', engine: 'ahrefs', price: 249, setup: 1.5, brandRadarPrompts: 10, note: '$249/mo. More history, content explorer. Brand Radar custom prompts: 10.' },
  ahrefs_advanced: { label: 'Ahrefs Advanced', vendor: 'Ahrefs', plan: 'Advanced', kind: 'keyword', engine: 'ahrefs', price: 449, setup: 1.5, brandRadarPrompts: 20, note: '$449/mo. Brand Radar custom prompts: 20.' },
  semrush_pro: { label: 'Semrush Pro', vendor: 'Semrush', plan: 'Pro', kind: 'keyword', engine: 'semrush', price: 139.95, setup: 1.5, note: '$139.95/mo (~$117 annual). Keyword volume/KD, competitor estimates, position tracking.' },
  semrush_guru: { label: 'Semrush Guru', vendor: 'Semrush', plan: 'Guru', kind: 'keyword', engine: 'semrush', price: 249.95, setup: 1.5, note: '$249.95/mo. Content toolkit, more history.' },
  // Keysearch (docs/research/tools/2026q4/web-content.md §2): cheap keyword-difficulty finder for low-competition long
  // tails, smaller keyword/backlink database, so link strategy is guesswork. Starter ~$24/mo [third-party; official
  // pricing page 404'd, unverified].
  keysearch: { label: 'Keysearch Starter', vendor: 'Keysearch', plan: 'Starter', kind: 'keyword', engine: 'keysearch', price: 24, setup: 1, unverified: true, note: '~$24/mo [unverified]. Keyword difficulty, SERP checker, rank tracking. Smaller database: noisier volumes and KD, thin backlink data.' },
  sfrog_free: { label: 'Screaming Frog (free, 500 URLs)', vendor: 'Screaming Frog SEO Spider', kind: 'crawler', price: 0, setup: 1, urlCap: 500, note: 'Free up to 500 URLs: enough for almost every early-stage marketing site.' },
  sfrog: { label: 'Screaming Frog (paid licence)', vendor: 'Screaming Frog SEO Spider', kind: 'crawler', price: 23.25, annual: 279, setup: 1, urlCap: Infinity, note: '~$279 (£199) a year per seat; needed only past 500 URLs.' },
  surfer: { label: 'Surfer', vendor: 'Surfer SEO', kind: 'optimizer', price: 99, setup: 1, note: '~$99/mo entry (sources conflict). Content brief and term checklist built from the current top results.' },
  clearscope: { label: 'Clearscope Essentials', vendor: 'Clearscope', kind: 'optimizer', price: 129, setup: 1, note: '$129/mo Essentials. Term coverage grade against the top results.' },
  otterly: { label: 'Otterly.AI Lite', vendor: 'Otterly.AI', kind: 'tracker', price: 29, setup: 1, prompts: 15, engines: ['chatgpt', 'perplexity', 'aio', 'gemini'], note: '~$29/mo for 15 prompts on 4 engines: mentions and cited links, one run per prompt per day.' },
  peec: { label: 'Peec AI Starter', vendor: 'Peec AI', kind: 'tracker', price: 95, setup: 1.5, prompts: 50, engines: ['chatgpt', 'perplexity', 'aio', 'gemini', 'claude'], note: '~EUR 70-95/mo for 50 prompts: visibility %, position, sentiment, which domains get cited.' },
  semrush_ai: { label: 'Semrush AI Visibility Toolkit', vendor: 'Semrush', plan: 'AI Visibility Toolkit', kind: 'tracker', price: 99, setup: 1, prompts: 25, engines: ['chatgpt', 'perplexity', 'aio', 'gemini'], note: '~$99/mo per domain, 25 prompts.' },
  brand_radar: { label: 'Ahrefs Brand Radar (AI add-on)', vendor: 'Ahrefs', plan: 'Brand Radar AI', kind: 'tracker', price: 199, setup: 1, prompts: 50, needs: 'ahrefs', engines: ['chatgpt', 'perplexity', 'aio', 'gemini', 'claude'], note: 'From ~$199/mo on top of an Ahrefs plan (plans include a few custom prompts already).' },
  profound: { label: 'Profound Growth', vendor: 'Profound', plan: 'Growth', kind: 'tracker', price: 399, setup: 2, prompts: 100, engines: ['chatgpt', 'perplexity', 'aio', 'gemini', 'claude'], note: '~$399/mo self-serve (pricing changed Sep 2026); enterprise is custom, often 4-5 figures/mo.' },
};
export const TOOL_ORDER = Object.keys(TOOLS);

// Third-party estimate error vs Search Console (effects-and-risks §8): Ahrefs 2022 study of 1,635 sites: median
// deviation ~50% (Ahrefs) and ~68% (Semrush); small sites overshoot several-fold (practitioner tests 6-10x).
// Modelled as a lognormal multiplier fixed per seed, tool and query: sigma 0.8 gives a median |error| of ~50%,
// sigma 1.05 with a +10% bias ~65% [design fit to the study's medians]. Small sites: +ln(4) bias [design, below
// the 6-10x practitioner anecdotes]. Volumes under ~50/mo often show as "0-10" in the tools [design].
export const ESTIMATE = {
  ahrefs: { sigma: 0.8, bias: 0, kdSd: 8 },
  semrush: { sigma: 1.05, bias: 0.1, kdSd: 12 },
  // Keysearch: no published accuracy study. Smaller index → wider error than Semrush and a noisier KD [design].
  keysearch: { sigma: 1.3, bias: 0.15, kdSd: 18, thinBacklinks: true },
  smallSiteBias: Math.log(4), smallSiteMonthly: 1000,
  zeroVolumeBelow: 50, zeroVolumeChance: 0.5,
};
export const GSC = { lagDays: 3, historyDays: 120, anonymisedShare: 0.15 }; // ~2-3 day lag (Google); anonymised queries [design share]

// Content optimizer (Surfer/Clearscope) [design]: a brief helps a little when used as a checklist; followed
// blindly (every suggested term, word count matched to the top results) the page reads like the other ten.
export const OPTIMIZER = { briefHours: 0.25, scoreHours: 0.2, helpPositions: 1, sameyAbove: 0.9, sameyPositions: 6, sameyCitableMult: 0.5 };

// ---------------- GEO: AI answer visibility ----------------
// Engines and their share of AI referrals (Data-Mania, SE Ranking, Visionary via llm-visibility §3: ChatGPT 63-75%,
// Claude 5-18%, Gemini ~10%, Perplexity ~3%; AI Overviews send few clicks [design 7%]).
export const ENGINES = {
  chatgpt: { label: 'ChatGPT', share: 0.68, bot: 'OAI-SearchBot', retrieve: { generic: 0.15, comparison: 0.8 }, lagDays: 240, cap: 0.64 },
  claude: { label: 'Claude', share: 0.1, bot: 'Claude-SearchBot', retrieve: { generic: 0.15, comparison: 0.75 }, lagDays: 200, cap: 0.73 },
  gemini: { label: 'Gemini', share: 0.1, bot: 'Google-Extended', retrieve: { generic: 0.5, comparison: 0.9 }, lagDays: 150, cap: 0.68, botMult: 0.3 },
  perplexity: { label: 'Perplexity', share: 0.05, bot: 'PerplexityBot', retrieve: { generic: 1, comparison: 1 }, lagDays: 0, cap: 0.68 },
  aio: { label: 'Google AI Overviews', share: 0.07, bot: null, retrieve: { generic: 1, comparison: 1 }, lagDays: 0, cap: 0.68, needsRanking: true },
};
// Retrieval: Semrush 34.5% of ChatGPT queries searched (Feb 2026), Profound ~18%, Metricus: comparison prompts
// reliably trigger search (llm-visibility §1). Training lag: Semrush reported a ~June 2024 cutoff for the default
// ChatGPT model in Jan 2026; lagDays are [design] stand-ins for "the next model learns about you months later".
// cap: SparkToro/Gumshoe 2026: category top-3 brands are named in 64% (ChatGPT), 68% (Google AI), 73% (Claude) of runs.
export const ENGINE_ORDER = Object.keys(ENGINES);

// AI-crawler gates (OpenAI bot docs: OAI-SearchBot controls ChatGPT search inclusion, GPTBot is training only).
// A blocked search bot removes that engine's retrieval visibility; Google-Extended affects Gemini grounding only
// (botMult). llms.txt: SE Ranking 300k domains, no relationship to citations: effect 0.
export const BOTS = ['OAI-SearchBot', 'GPTBot', 'Claude-SearchBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended'];
export const CDN_BLOCK_CHANCE = 0.3; // [design] share of new sites whose CDN/template robots.txt blocks AI bots (Cloudflare blocks AI crawlers by default for new domains since mid-2025)

// Signal weights in "mention equivalents" [design], ordered by the research: branded third-party mentions and
// listicles strongest (Ahrefs r=0.66 web mentions vs 0.22 backlinks), review sites (G2 38% of shortlists),
// comparison pages, community (Reddit top-cited but engine- and time-varying), freshness mild (Ahrefs 13-26%).
export const SIGNAL = {
  listicle: 3, listicleMonthlyDrop: 0.1, // Seer: ~30% monthly swing in listicle citations; each list drops you ~10%/mo unless refreshed [design]
  review: 0.15, reviewCap: 50,
  comparisonPage: 2.5, staleDays: 365, staleMult: 0.6,
  communityPost: 0.5, communityWeek: 0.5, communityRampWeeks: 8,
  brandPer10: 0.6, // market.brand 0-100 → mentions from PR, podcasts and word of mouth
  ownMention: 1, ownHalfLifeDays: 365, // PH, HN, cited articles (the legacy O.citations increments)
  paidDisclosed: 1.2, paidUndisclosed: 3,
  astroturfPost: 1.2, backlashNeg: 6,
  saturation: 40, // p = cap × (1 − e^(−S/40))
  redditWeight: { chatgpt: 0.4, claude: 1, gemini: 0.9, perplexity: 0.3, aio: 0.9 }, // ChatGPT cut Reddit citations ~86% Aug 2026 [S]; Perplexity favours YouTube (LLM Pulse) [S]
};
// Hidden buyer prompt mix the market actually asks (traffic is computed on this, not on the player's set) [design].
export const BUYER_MIX = { generic: 0.55, comparison: 0.45 };
export const RUN_NOISE = 0.35; // per engine-day lognormal sigma: answers rarely repeat (SparkToro: <1% identical lists)

// AI referral traffic and conversion (llm-visibility §3): AI = 0.5-3% of a SaaS site's sessions (IT/software 2.8%
// Conductor); converts 2-5x organic (Similarweb 2.2x, Semrush 4.4x, Data-Mania 5x; Ahrefs 23x n=1 ceiling).
// buyerSessions: AI-assistant sessions per day that would click through to a vendor named in every answer [design].
export const AI_TRAFFIC = {
  buyerSessions: { b2c: 18, smb: 6, ent: 3 },
  growthPerYear: 2.2, growthCap: 5, // AI referral volume 2-4x/yr 2026-27, slowing [design]
  convVsOrganic: 3.5, // midpoint of 2-5x vs commercial-intent organic (game previously used 3x)
  wrongFactConv: 0.85, // visitors arriving with a wrong price or a non-existent free plan in mind [design]
  negConv: 0.7,
  undercount: [2, 3], // self-reported "ChatGPT" mentions exceed measured AI sessions 2-3x [design]
};

// Hours for actions (llm-visibility §5, all [design]).
export const HOURS = {
  audit: 6, // 4-8 h: grader + 20-30 prompts x 3 runs on 3 engines + robots/render check
  promptSetBase: 1, promptSetPer: 0.1, promptSetMax: 6, // 3-6 h for 30-50 real buyer prompts
  manualPerAnswer: 1.5 / 60, // ~1.5 min to run a prompt and read the answer
  robots: 0.5, llmsTxt: 1,
  communityWeek: 3, // 2-4 h/week of disclosed, useful answers
  astroturf: 1.5, // writing a fake "has anyone tried X?" thread from an alt account
  paidPlacement: 1,
  factFix: { pricing_page: 2, listings: 1.5, facts_page: 3, old_posts: 2 },
  pasteAnswer: 0.15,
  monthlyMonitor: 0.5, // reviewing a tracker dashboard, per week
};

// Risks [design unless noted].
export const RISK = {
  astroturfDetectPerPostWeekly: 0.04, // per live fake thread per week: mods, Reddit spam filters (~25k/day), screenshots
  astroturfBrand: 6,
  paidPlacementUsd: [400, 2500], // "best X" list placement asks; link insertion ~$360 (Ahrefs), guest post ~$110-1,460 (BuzzStream)
  paidUndisclosedDetectMonthly: 0.04,
  ftcLegalUsd: [6000, 15000], // counsel + takedowns after an FTC/competitor complaint; statutory ceiling ~$51,744 per violation (FTC 2024 rule)
  wrongFactOnPriceChange: 0.7, wrongFactMonthly: 0.03, // hallucinated free plan / feature once you are visible
  wrongFactCostDays: 45, // unnoticed this long → traceable cost
  retrievalFixDays: [14, 35], // retrieval engines re-read fixed sources in weeks; training engines wait for lagDays
};
