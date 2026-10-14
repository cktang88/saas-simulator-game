// Growth (paid ads, UGC, organic) parameters. Source of truth: docs/research/marketing-and-ads.md (2026-10).
// Values tagged [design] are game assumptions bounded by the cited sources, not published statistics;
// the UI must never present them as real benchmarks.

export const PLATFORMS = {
  meta: {
    label: 'Meta', long: 'Meta Ads Manager (Facebook / Instagram)', kind: 'auction', icon: 'Ⓜ',
    models: ['b2c', 'smb', 'ent'],
    // CPM: B2C consumer $12–20, SaaS/B2B $20–35 (Superads 2025–2026; Affect Group 2025)
    cpm: { b2c: 14, smb: 27, ent: 30 },
    // Link-CTR scale vs the quality curve below; B2B ×0.7 per research §6 "Meta link CTR by creative quality"
    ctrScale: { b2c: 1, smb: 0.7, ent: 0.6 },
    lpvRate: 0.8, // link click → landing page view [design], typical 70–90%
    intent: 1, // post-click conversion multiplier vs the landing baseline
    season: 'social',
    learning: { threshold: 50, window: 7, learnDays: 7 }, // 50 opt. events / ad set / 7 days (Meta docs)
    report: { web: 0.85, ios: 0.65 }, // reported/true at 7d click + 1d view [design], research §6 attribution row
    levels: ['Campaigns', 'Ad sets', 'Ads'],
    vendor: 'Meta Platforms, Inc.', descriptor: 'FACEBK *ADS',
    thresholds: [25, 50, 250, 500, 750], // billing thresholds rise after successful payments [design]
    newDailyLimit: 50, // new ad accounts start with a daily spending limit that rises with paid bills [design]
    formats: ['static', 'carousel', 'ugc_video', 'founder_video', 'ai_ugc'],
    objectives: ['sales', 'leads', 'app', 'traffic', 'awareness'],
  },
  tiktok: {
    label: 'TikTok', long: 'TikTok Ads Manager', kind: 'auction', icon: '♪',
    models: ['b2c', 'smb'],
    cpm: { b2c: 10, smb: 12, ent: 14 }, // $8–13 (Influee 2026, TT Calculator 2026)
    ctrScale: { b2c: 0.6, smb: 0.45, ent: 0.4 }, // link CTR 0.5–0.7% (Influee 2026)
    lpvRate: 0.75, intent: 0.8, season: 'social',
    learning: { threshold: 50, window: 7, learnDays: 7 },
    report: { web: 0.75, ios: 0.55 },
    levels: ['Campaigns', 'Ad groups', 'Ads'],
    vendor: 'TikTok Ads', descriptor: 'TIKTOK ADS',
    thresholds: [50, 100, 250, 500],
    newDailyLimit: 100,
    formats: ['ugc_video', 'founder_video', 'ai_ugc'], // video only; creative burns out faster than on Meta
    objectives: ['sales', 'app', 'traffic'],
    fatigueSpeed: 1.6, // [design] "creative burns out faster than on Meta" (research §1.4)
  },
  google: {
    label: 'Google Ads', long: 'Google Ads (Search)', kind: 'search', icon: 'G',
    models: ['b2c', 'smb', 'ent'],
    // CPC: all-industry $5.26–5.42 (WordStream 2025/2026); B2B SaaS non-brand $2.5–6, spikes $20+ (Involve Digital)
    cpc: { b2c: 2.5, smb: 5.3, ent: 8 },
    searchCtr: 0.066, // WordStream 2025/2026 all-industry search CTR 6.6%
    lpvRate: 0.95,
    intent: 1.6, // search CVR 7.5–8.2% (WordStream) vs SaaS landing median 3.8% (Unbounce) ≈ ×1.6–2 [design]
    demandPerKeyword: { b2c: 6, smb: 3, ent: 1.2 }, // clicks/day available per relevant keyword [design]
    season: 'search',
    learning: { threshold: 15, window: 30, learnDays: 14 }, // Smart Bidding ≥15–30 conv/30d; 1–2 weeks relearn (Google Ads Help, GrowthSpree 2026)
    report: { web: 0.9, ios: 0.8 },
    levels: ['Campaigns', 'Ad groups', 'Ads'],
    vendor: 'Google Ads', descriptor: 'GOOGLE *ADS',
    thresholds: [50, 200, 350, 500],
    newDailyLimit: null,
    formats: ['search_text'],
    objectives: ['sales', 'leads'],
  },
  apple: {
    label: 'Apple Ads', long: 'Apple Search Ads', kind: 'search', icon: '',
    models: ['b2c'],
    cpc: { b2c: 2.25 }, // average CPT ~$2.25 top-15 categories (SplitMetrics 2026); Finance ~$6
    searchCtr: 0.097, // tap-through rate 9.7%
    lpvRate: 0.66, // tap → install 66% (SplitMetrics 2026)
    intent: 1.4, // install→trial 7.1% NA (RevenueCat 2026) vs web landing 5% baseline [design]
    demandPerKeyword: { b2c: 8 },
    season: 'search',
    learning: null,
    report: { web: 0.95, ios: 0.95 }, // AdServices attribution is deterministic for ASA
    levels: ['Campaigns', 'Ad groups', 'Keywords'],
    vendor: 'Apple Search Ads', descriptor: 'APPLE.COM/BILL ADS',
    thresholds: [100, 250, 500],
    newDailyLimit: null,
    formats: [],
    objectives: ['app'],
  },
  linkedin: {
    label: 'LinkedIn', long: 'LinkedIn Campaign Manager', kind: 'auction', icon: 'in',
    models: ['smb', 'ent'],
    cpm: { smb: 63, ent: 70 }, // median CPM $63.19, CPC $9.39, CTR 0.67%, CPL $202 (Metadata 2025)
    ctrScale: { smb: 0.67, ent: 0.67 },
    lpvRate: 0.85, intent: 0.9, season: 'b2b',
    learning: null,
    report: { web: 0.75, ios: 0.75 },
    levels: ['Campaign groups', 'Campaigns', 'Ads'],
    vendor: 'LinkedIn Corporation', descriptor: 'LINKEDIN ADS',
    thresholds: [0], // LinkedIn charges the card as spend accrues
    newDailyLimit: null,
    formats: ['static', 'founder_video', 'ugc_video', 'carousel'],
    objectives: ['leads', 'sales', 'traffic'],
    leadFormRate: 0.1, // lead gen form fill rate per click [design; vendor-cited ~10%, unverified]
  },
};

export const platformsFor = (model) => Object.keys(PLATFORMS).filter((p) => PLATFORMS[p].models.includes(model));

// Monthly CPM multipliers. B2C anchors Oct/Nov/Dec/Jan from Superads (Oct 2024–Sep 2025); other months and the
// BFCM spike are [design] bounded by "Q4 +25–60%". B2B is flatter with a February peak (Superads SaaS 2025–2026).
export const SEASON = {
  b2c: [0.9, 0.95, 0.97, 0.98, 1.0, 0.98, 0.97, 0.98, 1.0, 1.03, 1.15, 1.04],
  b2b: [1.05, 1.35, 1.15, 1.0, 0.95, 0.8, 0.8, 0.9, 1.0, 1.05, 1.15, 1.2],
  bfcm: 1.7, // BFCM week multiplier on consumer social (1.5–2.0 per research §6)
  searchDamping: 0.5, // search CPCs move about half as much as social CPMs [design]
};

// Meta link CTR by hidden creative quality q∈[0,1] (research §6, [design] anchored to Triple Whale / TikTok):
// poor 0.4–0.7%, average 0.8–1.2%, good 1.3–2.0%, winner 2.0–3.5%.
export const CTR_CURVE = [[0, 0.004], [0.35, 0.007], [0.36, 0.008], [0.7, 0.012], [0.71, 0.013], [0.95, 0.02], [1, 0.035]];
export const WINNER_Q = 0.95; // with a neutral brief ~5% of creatives draw q ≥ 0.95 (Motion 2026: ~5% hit rate)

// 7-day frequency → CTR multiplier, prospecting (research §6 [design] from Segwise 2.5–3.0 thresholds)
export const FREQ_CURVE = [[0, 1], [2, 1], [2.5, 0.95], [3, 0.85], [4, 0.7], [5, 0.6], [6, 0.5], [100, 0.5]];

export const AUDIENCES = {
  // Reachable relevant pool for a creative [design]; Andromeda serves each creative to a responsive pocket.
  broad: { label: 'Advantage+ audience (broad)', size: { b2c: 3_000_000, smb: 600_000, ent: 300_000 }, cpm: 1, ctr: 1, cvr: 1, vt: 0.05 },
  interests: { label: 'Detailed targeting (interests)', size: { b2c: 800_000, smb: 200_000, ent: 80_000 }, cpm: 1.15, ctr: 1, cvr: 1, vt: 0.06 },
  lookalike: { label: 'Lookalike (1%) of customers', size: { b2c: 1_500_000, smb: 400_000, ent: 150_000 }, cpm: 1.1, ctr: 1.1, cvr: 1.15, vt: 0.08, seedMin: 100 },
  retargeting: { label: 'Retargeting: website visitors (30d)', size: null, cpm: 1.8, ctr: 1.6, cvr: 2.0, vt: 0.25, seedMin: 100 },
  jobtitles: { label: 'Job titles / company size', size: { smb: 150_000, ent: 60_000 }, cpm: 1, ctr: 1, cvr: 1, vt: 0.04 },
};
export const POCKET_SHARE = 0.05; // share of the pool a single creative's responsive pocket covers [design]
export const WEAR_K = 0.5; // CTR wear per unit lifetime pocket frequency: ~25% CTR drop after ~3 weeks at $100/day [design]

export const PLACEMENTS = {
  advantage: { label: 'Advantage+ placements (recommended)', cpm: 1, ctr: 1, staticCtr: 1 },
  feeds: { label: 'Feeds only', cpm: 1.25, ctr: 1.08, staticCtr: 1.08 },
  reels: { label: 'Reels & Stories only', cpm: 0.85, ctr: 1.05, staticCtr: 0.6 },
};

export const OBJECTIVES = {
  sales: { label: 'Sales (conversions)', cpm: 1, ctr: 1, cvr: 1 },
  leads: { label: 'Leads', cpm: 1, ctr: 1, cvr: 1 },
  app: { label: 'App promotion', cpm: 0.95, ctr: 1, cvr: 1 },
  traffic: { label: 'Traffic (link clicks)', cpm: 0.85, ctr: 1.3, cvr: 0.45 }, // optimizes for clickers, not buyers [design]
  awareness: { label: 'Awareness (reach)', cpm: 0.6, ctr: 0.6, cvr: 0.4 },
};

// Format multipliers (CTR, post-click CVR) [design]; AI UGC CTR 0.85–1.10× and CVR 0.7–1.0× (Segwise 2026, Moburst)
export const FORMATS = {
  static: { label: 'Single image', ctr: 1, cvr: 1, video: false, hours: 0.75, cost: 0 },
  carousel: { label: 'Carousel', ctr: 1.05, cvr: 1, video: false, hours: 1.5, cost: 0 },
  ugc_video: { label: 'UGC video (creator)', ctr: 1.15, cvr: 1, video: true, hours: 0, cost: 0 },
  founder_video: { label: 'Founder-on-camera video', ctr: 1.1, cvr: 1.05, video: true, hours: 2, cost: 0, linkedinCtr: 1.25 },
  ai_ugc: { label: 'AI UGC / avatar video', ctr: 0.97, cvr: 0.9, cvrHighPrice: 0.7, video: true, hours: 0.5, cost: 0 },
  search_text: { label: 'Responsive search ad', ctr: 1, cvr: 1, video: false, hours: 0.5, cost: 0 },
};
export const AI_UGC = { tiers: { basic: 5, pro: 15, premium: 30 }, glitchChance: 0.1, glitchCtr: 0.4, highPriceMonthly: 75 };
// RevenueCat: a 0.2s lip-sync glitch cost 68% of CTR in one variant → glitchCtr ≈ 0.32–0.4 [design]

export const LEARNING_EFF = { learning: 0.75, limited: 0.82, active: 1, untracked: 0.6 }; // CPA +20–40% while learning [design]
export const DIMINISHING = { exponent: 0.2, ref: { b2c: 100, smb: 50, ent: 50 } }; // CPA ∝ spend^0.2 above ref $/day [design]
export const PURCHASE_OPT = { cpm: 1.1, convMult: 1.2 }; // optimizing for purchase finds better buyers at higher CPM [design]
export const COST_CAP_EXP = 2;
export const IOS_SHARE = { b2c: 0.45, smb: 0.2, ent: 0.1 }; // share of conversions on iOS (ATT/SKAN signal loss) [design]
export const NO_CAPI_FACTOR = 0.8; // pixel-only loses ~20% of events to browsers/ATT [design]
export const NO_TRIAL_PURCHASE_FACTOR = 0.45; // direct paywall purchase vs trial start rate [design ≈ trial-to-paid]
export const ATTRIBUTION_DAYS = 7; // 7-day click; 7d/28d view windows removed 2026-01-12 (PPC Land)

// Budget edits (research §6 "Budget scaling penalty" [design]): ≤20% none, 20–50% 50% chance, >50% reset.
export const BUDGET_EDIT = { safe: 0.2, coinFlip: 0.5 };

// UGC creators (Influee 2026: $150–212 avg, median ~$175, band $150–300; premium $500+).
export const UGC = {
  rateRange: [150, 300], premiumRange: [400, 650], deliveryDays: [7, 14],
  whitelistPct: 0.25, // 20–30% of base fee per 30-day window (Influencer Marketing Hub)
  hookVariation: 35, // extra hook variation per video [design]
  lateChance: 0.15, // [design]
  whitelistCtr: 1.1, // partnership / Spark ads run from the creator's handle [design]
};

// ---- Organic ----
export const ORGANIC = {
  // Personal network (research §6 [design]): 20–40% try it, 0–5% pay unless in ICP (5–15%).
  network: {
    tryRate: [0.2, 0.4], icpShare: { b2c: 0.12, smb: 0.06, ent: 0.03 }, payIcp: 0.1, payOther: 0.025,
    linkedinReach: 0.18, xReach: 0.12, clickRate: 0.05, newsletterOpen: 0.42, newsletterClick: 0.05,
  },
  // Build in public [design]; LinkedIn organic reach −47% in 2025 (van der Blom); link penalty −20–50% (Ordinal)
  social: {
    reach: { x: 0.06, linkedin: 0.08 }, linkPenalty: { x: 0.7, linkedin: 0.65 }, sigma: 0.8,
    breakoutChance: 0.02, breakoutMult: [8, 30], clickRate: 0.004, followRate: 0.003,
    audienceFit: { b2c: 0.3, smb: 1, ent: 0.6 }, // works for builder/marketer audiences, weak for consumers
    hours: { x: 0.5, linkedin: 0.75 },
  },
  // SEO (Ahrefs 2025: ~1.7% of new pages reach top 10 in a year; long-tail 3–6 mo, competitive 12–24 mo)
  seo: {
    rampMonths: { long: 4.5, mid: 9, hard: 18 },
    pTop10: { long: [0.25, 0.5], mid: [0.05, 0.25], hard: [0.01, 0.05] }, // [base, + quality bonus] [design]
    ctrByPos: [0.28, 0.15, 0.1, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018],
    page2Ctr: 0.008, deepCtr: 0.001,
    aioInformational: 0.42, // AI Overviews cut position-1 CTR ~58% (Ahrefs 2025-12)
    aioCommercial: 0.8, // [design] commercial/comparison queries less affected
    blogConv: 0.25, commercialConv: 0.6, // blog visitor→trial 0.5–2% vs landing 3.8% (Callin)
    slopPenalty: 0.4,
  },
  // GEO / LLM search: 0.3–1% of traffic, converts 1.3–5× organic (Ahrefs 2026-03, AirOps)
  geo: { visitsPerCitation: 0.04, exponent: 0.8, convMult: 3 },
  // K-factor: typical 0.1–0.25, good referral programs 0.4–0.7 (Saxifrage, LaunchList); cycle 30 days [design]
  wom: { k0: { b2c: 0.15, smb: 0.12, ent: 0.05 }, cycleDays: 30, kCap: 0.9, referredConvMult: 1.25 },
  referral: { // program boost to K [design], research: +0.05–0.3
    free_month: { label: 'Free month for both (product credit)', boost: 0.2 },
    credit: { label: 'Account credit / extra usage', boost: 0.17 },
    cash: { label: 'Cash reward', boost: 0.12 },
    oneSidedFactor: 0.6,
  },
  // Product Hunt (research §6 [design]): top-10 300–1,000 signups, ~60% day 1, paid conversion 0.25–2%
  ph: { top10: [300, 1000], mid: [80, 250], low: [20, 80], paidConv: [0.0025, 0.02], dayShares: [0.6, 0.2, 0.1, 0.04, 0.03, 0.02, 0.01], prepHours: 8, dayHours: 10 },
  community: { // [design]
    sizes: { small: 5_000, medium: 50_000, large: 500_000 }, reachRate: [0.002, 0.02], strictness: { small: 0.5, medium: 0.8, large: 1 },
    clickLink: 0.03, clickNoLink: 0.008, tailDays: 180, hours: 1,
  },
  newsletter: { cpmRange: [25, 60], open: [0.35, 0.5], ctr: [0.01, 0.03], warm: 1.2 }, // [design], not in research
};
