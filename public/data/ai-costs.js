// AI cost data: coding-seat plans, in-product inference price points, feature types, model tiers, abuse and
// incident rates. DATA ONLY. Sources: docs/research/ops-2026/llm-spend.md (prices read Oct 2026; [official] =
// provider pricing page, [unverified] = secondary write-ups). Anything tagged [design] is a game assumption and
// must never be shown to players as a real statistic. Model tiers are generic (frontier / mid / small): the
// price points are the researched list prices of 2026 model families, not a claim about any one product.

// ---- Coding seats (per engineer per month) ----
// price: sticker $/month. allowEq: API-list-price-equivalent usage the seat covers before its limits bite [design]
// (subscriptions are heavily subsidised against raw API rates; reported ratios are 4-5x at the power tiers).
export const SEAT_PLANS = {
  individual: { label: 'Individual seat', price: 20, allowEq: 80, note: '~$20/mo individual plan (Pro-class) [official/unverified sticker]; the 5-hour window and weekly limits bite on agentic use.' },
  plus: { label: 'Plus seat', price: 60, allowEq: 240, note: '~$60/mo (Pro+-class) [unverified].' },
  power100: { label: 'Power seat ($100)', price: 100, allowEq: 450, note: '~5x individual usage at ~$100/mo [official].' },
  power200: { label: 'Power seat ($200)', price: 200, allowEq: 1000, note: '~20x individual usage at ~$200/mo [unverified third-party].' },
  team_std: { label: 'Team standard seat', price: 25, allowEq: 100, note: 'Team standard seat $25/mo monthly [official].' },
  team_prem: { label: 'Team premium seat', price: 125, allowEq: 625, note: 'Team premium seat $125/mo, 5x standard usage [official].' },
};
export const SEAT_ORDER = ['individual', 'plus', 'team_std', 'power100', 'team_prem', 'power200'];
// Per-engineer monthly API-equivalent usage: log-normal. median/sigma chosen so ~17% exceed $1,000, ~13% are under
// $100 and a fat tail runs to several thousand [design, shaped by Georgian n=252 (23% >$1,000, 9% <$100) and DX
// $200-600 averages, both secondary]. Gartner (via The Register) heavy agentic users $2,000-5,000 [unverified].
export const CODING_USAGE = { median: 380, sigma: 1.1, monthlyNoise: 0.2 };
export const CODING = {
  runawayMonthly: 0.015, // chance per seat-month that an unattended agent loop burns a big bill [design]
  runawayMult: [3, 12], // multiple of that engineer's normal month [design]
  leakMonthlyShared: 0.012, // chance per month a shared, unscoped API key leaks (repo, bundle, chat paste) [design]
  leakMonthlyScoped: 0.002, // scoped per-environment keys with rotation [design]
  leakMedianUsd: 4000, leakSigma: 1.3, leakMaxUsd: 90000, // research: $82k bill on a $180/mo account; one response case near $1M [unverified]
  leakAlertShare: 0.3, // with alerts + revoke-first the bill is ~30% of the unattended one [design]
  limitSlow: 0.5, // a seat that hit its limit works at this share of the AI-assisted pace [design]
  rotateHours: 3, auditHours: 1.5, setupHours: 1,
};

// ---- In-product inference ----
// $ per million tokens (list). frontier ~ the $4-5 in / $20-25 out class; mid ~ $2-3 / $10-15; small spans $0.10-$1.00 in,
// $0.50-$5 out, so the blend used here is a [design] midpoint. Cache reads ~10% of input; cache writes ~1.25x (5-minute);
// batch 50% off async work [official].
export const MODEL_TIERS = {
  frontier: { label: 'Frontier model', in: 5, out: 25, quality: { chat: 1, rag: 1, agent: 1, extract: 1 } },
  mid: { label: 'Mid-tier model', in: 2, out: 10, quality: { chat: 0.95, rag: 0.93, agent: 0.85, extract: 0.95 } },
  small: { label: 'Small model', in: 0.25, out: 1.25, quality: { chat: 0.86, rag: 0.74, agent: 0.5, extract: 0.9 } },
};
export const TIER_ORDER = ['frontier', 'mid', 'small'];
export const CACHE = { readShare: 0.1, writePremium: 1.25, hitRate: 0.9 };
export const BATCH_DISCOUNT = 0.5;
// Tokens per request and requests per active user per month by feature type [design from the research ranges]:
// chat 1-5k in / 300-1k out; RAG 5-30k in; agent tasks 100k-1M in across tool loops.
export const FEATURE_TYPES = {
  chat: { label: 'Chat / assistant', in: 3000, out: 600, reqs: 60, cacheable: 0.5, batchable: 0 },
  rag: { label: 'RAG / answers over their data', in: 15000, out: 700, reqs: 40, cacheable: 0.6, batchable: 0.1 },
  agent: { label: 'Agent tasks (multi-step)', in: 300000, out: 8000, reqs: 10, cacheable: 0.8, batchable: 0.2 },
  extract: { label: 'Extraction / summaries (async)', in: 8000, out: 500, reqs: 100, cacheable: 0.3, batchable: 1 },
};
// The Spec editor's "usage level" maps onto a starting configuration.
export const LEVEL_DEFAULTS = {
  light: { type: 'chat', model: 'small', reqs: 30 },
  moderate: { type: 'chat', model: 'mid', reqs: 200 },
  heavy: { type: 'agent', model: 'frontier', reqs: 20 },
};
export const USAGE_SIGMA = 0.9; // paid users' monthly usage is log-normal, mean-normalised [design]
export const FREE_TIER = {
  ratio: 5, // free users per paying account once a free AI tier is offered [design]
  casualUse: 0.3, // free users' average usage vs a paid user [design]
  botShare: 0.06, // free signups that are scripted heavy users / resold access [design; no sourced rate]
  botMult: 40, // their usage vs a paid user without a rate limit [design]
  defaultCapReqs: 40, // a sensible free-tier monthly request cap [design]
};

export const PROVIDERS = {
  anthropic: { label: 'Anthropic API', counterparty: 'Anthropic API', cloud: false },
  openai: { label: 'OpenAI API', counterparty: 'OpenAI API', cloud: false },
  google: { label: 'Google Cloud (Vertex AI)', counterparty: 'Google Cloud', cloud: true },
  azure: { label: 'Microsoft Azure OpenAI', counterparty: 'Microsoft Azure', cloud: true },
  aws: { label: 'AWS Bedrock', counterparty: 'AWS', cloud: true },
};

// Quality (activation/retention) effects [design]. quality is the blended score vs the frontier baseline.
export const QUALITY = { churnPer: 1.4, conversionPer: 0.9, floor: 0.9 }; // churn x(1 + 1.4*(1-q)), conversion x(1 - 0.9*(1-q)) once q < floor
export const EVALS = { hours: 4, usd: 40, ttlDays: 75, passRatio: 0.92, routeHours: 3 }; // an eval run before a swap [design]
export const ROUTING = { share: 0.6, misroutePenalty: 0.06, tunedBonus: 0.02 }; // share of requests sent to the small model [design]

export const PASS_THROUGH = { markup: 1.4, creditChurnFriction: 0.25, addonAdoption: 0.55, addonPriceRef: 20, hours: 1.5 }; // [design]; Nalpeiron: 44% absorb, 42% partial, 13% full pass-through [unverified]

export const DEPRECATION = {
  monthly: 0.07, // chance per month that a pinned model family gets a retirement notice [design]
  noticeDays: [60, 150],
  migrateHours: [6, 3], // base + per feature on that tier [design]
  forcedChurn: 1.2, forcedDays: 14, // an unplanned cutover: errors for ~2 weeks [design]
};
export const AGENT_LOOP = { monthly: 0.03, mult: [4, 15], capTokensCut: 0.15 }; // runaway agent loop in production when no per-task token cap [design]
export const BUDGET = { spikeMult: 2, spikeMinUsd: 40, alertShares: [0.75, 0.9], setupHours: 1 }; // Claude Enterprise alerts at 75/90% [unverified]
export const CLOUD = {
  footprints: {
    lean: { label: 'Lean (one region, few managed services)', base: 30, perAcct: 0.6 },
    standard: { label: 'Standard (managed DB, queues, staging)', base: 150, perAcct: 1.2 },
    overbuilt: { label: 'Over-provisioned (multi-region, big instances)', base: 700, perAcct: 2.5 },
  },
  moveHours: 16, rightsizeHours: 10, lockInPerMonth: 0.04, // [design]
  providers: {
    default: { label: 'Vercel + Supabase (default stack)', counterparty: null },
    aws: { label: 'AWS', counterparty: 'AWS' },
    google: { label: 'Google Cloud', counterparty: 'Google Cloud' },
    azure: { label: 'Microsoft Azure', counterparty: 'Microsoft Azure' },
    cloudflare: { label: 'Cloudflare', counterparty: 'Cloudflare' },
  },
};

// Margin benchmarks [design, from ICONIQ / Bessemer secondary write-ups in the research note].
export const MARGIN_BENCH = { aiNative: [0.45, 0.6], classic: [0.75, 0.8] };
