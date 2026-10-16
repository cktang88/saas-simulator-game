// Consumer subscription-app playbook parameters (Launch playbook app). Source of truth for the sourced facts:
// docs/research/consumer-apps/paywall-mobile-playbook.md and docs/research/consumer-apps/ugc-clipping.md (2026-10).
// [design] marks a simulator assumption bounded by those sources: never show it to players as a statistic.
// [unverified] marks a number from one secondary source or conflicting reports.

// ---- Platform stack ----
// Hours are founder hours to a store-ready MVP; agentMult applies when an AI coding agent is configured (Product ->
// Build). No source gives time-to-MVP by stack [design]: JS/TS stacks are what coding agents do best, so Expo is fastest
// among the store-capable stacks; a PWA is quickest of all but has no store presence and no in-app purchase.
export const STACKS = {
  expo: { label: 'Expo / React Native', hours: 34, agentMult: 0.5, platforms: ['ios', 'play'], store: true, note: 'One TypeScript codebase for iOS and Android, EAS builds and OTA updates; the stack AI coding agents know best.' },
  native_ios: { label: 'Native Swift (iOS only)', hours: 80, agentMult: 0.75, platforms: ['ios'], store: true, note: 'Best platform feel, one store only; agents are weaker at SwiftUI edge cases.' },
  native_both: { label: 'Native Swift + Kotlin', hours: 150, agentMult: 0.8, platforms: ['ios', 'play'], store: true, note: 'Two codebases, two sets of bugs.' },
  pwa: { label: 'Web app / PWA', hours: 28, agentMult: 0.5, platforms: [], store: false, note: 'No App Store review and no store fee, but no store discovery, no in-app purchase and no push on every device. Payments go through Stripe on the web.' },
};
export const ACCOUNTS = { appleYear: 99, googleOnce: 25, appleEnrollDays: 2 }; // Apple Developer Program $99/yr; Google Play $25 once (long-standing, not re-verified)

// Expo EAS: free plan 15 Android + 15 iOS builds a month; Starter $19/mo; extra build prices ~$2 iOS / ~$1 Android [unverified]. Check expo.dev/pricing.
export const EAS = { freeBuilds: { ios: 15, android: 15 }, starterMonthly: 19, extra: { ios: 2, android: 1 }, buildHours: 0.4, unverified: true };

// ---- App Review ----
// Apple: ~90% of submissions reviewed within 24-48 h; plan 1-3 days plus a resubmission cycle [design].
export const REVIEW = {
  dayWeights: [[1, 0.5], [2, 0.32], [3, 0.12], [4, 0.06]],
  fixHours: { '3.1.2': 3, '3.1.1': 5, '4.3': 8, '5.1.1': 2, '2.1': 4 }, // founder hours to fix and resubmit [design]
  testflightExternalDays: 1,
  testflightHours: 3,
  // Guidelines the simulator checks; per-guideline rejection odds below are [design] (no credible 2025 per-guideline counts exist;
  // the only breakdown is the 2018 one in the research note).
  guidelines: {
    '3.1.2': 'Subscriptions: price, billing period, trial end and renewal terms must be clear and conspicuous (a toggle that turns free trials on and off was reported rejected from Jan 2026 [unverified]).',
    '3.1.1': 'Digital goods must use in-app purchase; a web checkout inside the app is only allowed under the US link-out rules (status unsettled in Oct 2026 [unverified]).',
    '4.3': 'Spam / copycat: an AI-built clone of a popular category app is a high-risk submission; differentiate in function and metadata.',
    '5.1.1': 'Privacy: policy URL, privacy nutrition label, accurate permission strings.',
    '2.1': 'App completeness: crashes, placeholder content, broken sign-in.',
  },
  base: { '3.1.2': 0.04, '3.1.1': 0.02, '4.3': 0.04, '5.1.1': 0.03, '2.1': 0.05 },
  noPrivacyPolicy: 0.7, // missing privacy policy / label: Apple nearly always catches it [design]
  noBeta2_1: 0.16, // no TestFlight round: crash or placeholder rejection [design]
  linkOut3_1_1: 0.3, // web checkout inside the app [unverified rules]
};

// ---- Paywall funnel (median product at neutral fit), anchored to RevenueCat 2026 ----
// Hard paywall download-to-paid ~12.1% at Day 35 vs freemium ~2.1%; Day-60 revenue per install $3.09 vs $0.38. The step splits
// below multiply to those anchors; they are [design] decompositions. A trial adds starts but loses some at trial end.
export const PAYWALL = {
  types: {
    hard_no_trial: { label: 'Hard paywall, no trial', view: 0.86, start: 0.14, trialDays: 0, mixMods: { weekly: 1, monthly: 1, annual: 1 }, note: 'Median ~12% download-to-paid by Day 35 (RevenueCat 2026).' },
    hard_trial: { label: 'Hard paywall with free trial', view: 0.86, start: 0.28, trialDays: 3, mixMods: { weekly: 0.9, monthly: 1, annual: 1.15 }, trialToPaid: 0.42, ltvBoost: 1.2, note: 'More starts, fewer survive trial end; trial starters retain better (vendor claim up to +64% LTV [unverified]).' },
    soft: { label: 'Soft paywall (dismissable)', view: 0.9, start: 0.045, trialDays: 0, mixMods: { weekly: 0.8, monthly: 1.3, annual: 0.9 }, note: 'Between hard paywall and freemium [design].' },
    freemium: { label: 'Freemium (paywall at a limit)', view: 0.3, start: 0.07, trialDays: 0, mixMods: { weekly: 0.35, monthly: 2, annual: 0.55 }, note: 'Median ~2.1% download-to-paid by Day 35 (RevenueCat 2026); more people use the product.' },
  },
  // Plan mix weights before price and default effects [design]; weekly plans maximise early cash and churn fastest.
  mixBase: { weekly: 0.42, monthly: 0.18, annual: 0.4 },
  defaultBoost: 1.6, // the highlighted plan gets 1.6x weight
  defaultPrices: { weekly: 5.99, monthly: 9.99, annual: 29.99 }, // typical consumer ladder [design]
  weeklyPerceived: 0.55, // a weekly price is judged per week, so its perceived monthly cost is discounted [design]
  fitRef: 0.9, // product factor at a "median" product (fit score 0.5)
  // Dark patterns: they lift conversion for a while and cost refunds, reviews, review rejections and FTC/ROSCA exposure [design].
  dark: {
    countdown: { label: 'Fake countdown / limited-time timer', conv: 0.08, refund: 0.5, r312: 0.2 },
    toggleTrial: { label: 'Free-trial toggle switch', conv: 0.1, refund: 0.6, r312: 0.5 },
    hiddenClose: { label: 'Hidden / delayed close button', conv: 0.06, refund: 0.35, r312: 0.1 },
    smallPrint: { label: 'Price in small print under "FREE"', conv: 0.12, refund: 0.9, r312: 0.45 },
  },
  quiz: { minSteps: 5, goodSteps: [7, 12], maxSteps: 16, lift: [0.85, 1.3], completionCost: 0.012 }, // no sourced lift [unverified]: vendors cite it qualitatively
  webFriction: 0.62, // leaving the app for a browser checkout loses buyers [design]
  tests: { minViewsPerArm: 400, maxArms: 2 }, // several hundred paywall views per arm [design]
  testHours: 1.5,
  rosca: { monthlyBase: 0.004, perDark: 0.012, noCancelCopy: 0.01, bill: [3000, 15000] }, // inquiry odds per month and legal bill [design]; ROSCA still applies (click-to-cancel rule vacated July 2025)
};

// ---- Store economics ----
export const ECON = {
  proceedsPerYearToSbp: 1_000_000,
  payoutReportDelay: 'about 33-45 days after the end of the fiscal month',
  refundBase: { week: 0.06, month: 0.03, year: 0.07 }, // [design]; weekly and aggressive paywalls refund more
  refundSpike: { share: 0.1, minCharges: 25 }, // monthly first-charge refund share that counts as a spike [design]
  reviewHit: 0.25, // share of refunds that leave a 1-star review [design]
};

// ---- Saturation ----
// Many apps run the same playbook, so CPMs and hit rates decay as the category fills [design]. Base level by category plus a
// slow drift with game time (the post spreads, more clones ship).
export const SATURATION = {
  base: { default: 0.35, ai_tools: 0.7, photo_video: 0.7, health_fitness: 0.6, education_language: 0.55, productivity: 0.5, finance: 0.4, dating_social: 0.55, meditation_wellness: 0.55, games_entertainment: 0.5 },
  driftPerDay: 0.0004,
  max: 0.92,
  cpiMult: 0.7, // CPI x (1 + 0.7 s)
  hitMult: 0.55, // organic breakout rate x (1 - 0.55 s)
  clipConvMult: 0.5, // view-to-install x (1 - 0.5 s)
  clipCpmMult: 0.8, // the market CPM clippers expect rises x (1 + 0.8 s)
  reject43: 0.5, // 4.3 risk x (1 + 0.5 s) for low-differentiation apps
};

// ---- Creator programs (Sideshift-style marketplace) ----
export const CREATORS = {
  subs: { none: { label: 'Pay per video (no subscription)', monthly: 0, rosterMax: 6 }, pro: { label: 'Marketplace Pro', monthly: 199, rosterMax: 25 }, scale: { label: 'Marketplace Scale', monthly: 299, rosterMax: 60 }, team: { label: 'Marketplace Team', monthly: 999, rosterMax: 200 } }, // $199/$299/$999 (vendor blog; tier descriptions conflict [unverified])
  fee: [50, 300], bonusPer1k: [1, 4], // typical brand price $50-300/video; bonus $1-4 per 1,000 views (vendor blog)
  postDelay: [3, 9],
  hourPerBrief: 0.5, hourPerCreator: 0.12, // briefing, reviewing and rights clearance: the real operating cost
  // Views per post are heavy-tailed [design]: median a few hundred, breakouts 20-150x. Break-out share 5-10% (design default).
  views: { median: 900, sigma: 1.0, breakoutBase: 0.045, breakoutHook: 0.06, breakoutMult: [20, 120], tailDays: 6 },
  viewToInstall: 0.006, // link-in-bio click and install per view, at full fit [design]
  disclosure: { briefed: 0.93, unbriefed: 0.45, dailyRisk: 0.006, takedownUsd: 150, ftcOdds: 0.1, ftcBill: [2500, 9000], reachPenalty: 0.6, penaltyDays: 14 },
  promote: { whitelistPct: 0.25, days: 30, provenBoost: 0.22 }, // Partnership/Spark ads: whitelisting 20-30% of base fee per 30 days
  viralViews: 50_000,
};

// ---- Clipping campaigns (Whop Content Rewards-style) ----
export const CLIPPING = {
  cpm: [0.5, 1.5], // $0.50-1.50 per 1,000 views typical [unverified snapshot]; Whop cites ~$1
  platformFee: 0.07, // ~7%, sources conflict 7-10% [unverified]
  minBudget: 200,
  payoutHold: 7, // days before payout settles
  clippersPerDay: 3.2, // new clips per day at a $1 CPM in an unsaturated category [design]
  views: { median: 700, sigma: 1.05, boostBase: 0.03, boostMult: [15, 90] },
  contentFit: { podcast_clips: 0.2, meme: 0.1, demo_slideshow: 0.8, problem_hook: 1, reaction: 0.55 }, // content-to-product fit [design]
  viewToInstall: 0.0004, // views are cheap, installs from views are low [design]
  // Fraud (botted or fake views) is anecdotal [unverified]; share rises with CPM and without verification [design].
  fraud: { base: 0.05, perCpm: 0.09, cap: 0.5 },
  verification: {
    none: { label: 'Pay what the dashboard says', detect: 0, hoursPer20: 0 },
    basic: { label: "Rely on the platform's bot scoring", detect: 0.45, hoursPer20: 0.1 },
    manual: { label: 'Spot-check analytics and audience for every clip', detect: 0.88, hoursPer20: 0.8 },
  },
  templated: { required: /same video|exact template|copy this|reupload|re-upload|repost the same|use our template/i, original: /original|commentary|your own|add value|transform|react|voiceover|own words/i },
  crackdown: { first: 110, spread: 60, every: 160, bannedShare: [0.25, 0.5], mildShare: 0.06, viewCut: 0.55, days: 30 }, // YouTube July 2025 inauthentic-content policy; TikTok enforcement (scheduled, deterministic) [design]
  banRisk: { templatedDaily: 0.0018, originalDaily: 0.0002 },
  satTolerance: 0.6,
};

// ---- Meta ads for apps ----
// CPI by country tier. data.ai 2024: US iOS ~$3.50 non-gaming, India ~$0.28, Brazil ~$0.65 [dated]. Superads (all industries) median CPI
// fell $18 -> $12, Jun 2025 -> Jun 2026 [directional, unverified]. Tier 2 is an interpolation [design].
export const PAID = {
  geo: {
    t1: { label: 'Tier 1 (US, CA, UK, AU)', cpi: 3.5, arppu: 1, iosShare: 0.55, note: 'data.ai 2024 US iOS ~$3.50 [dated]' },
    t2: { label: 'Tier 2 (W. Europe, JP, KR)', cpi: 1.5, arppu: 0.6, iosShare: 0.4, note: 'interpolated [design]' },
    t3: { label: 'Tier 3 (IN, BR, PH, ID)', cpi: 0.45, arppu: 0.17, iosShare: 0.2, note: 'India ~$0.28, Brazil ~$0.65 (data.ai 2024) [dated]' },
  },
  objective: { install: { label: 'App installs', cpi: 1, conv: 1 }, purchase: { label: 'In-app purchase (AEO/value)', cpi: 1.35, conv: 1.3 } }, // optimising for purchase finds buyers at a higher CPM [design]
  advantage: { cpi: 0.9, minCreatives: 3, fewCreativesCpi: 1.12 }, // Advantage+ app campaigns lean on creative volume and event quality [design]
  learning: { threshold: 50, days: 7, learningCpi: 1.25, limitedCpi: 1.3 }, // ~50 optimisation events per ad set per week (Meta guidance); low volume raises cost
  fatigue: { meanDays: 36, spread: 0.35, ramp: 14, mult: 1.8, cap: 2.4 }, // winners fatigue after ~36 days, CPA x1.8 after (Agentio, secondary vendor study)
  scale: { ref: 100, exponent: 0.2 }, // CPI grows with daily budget above ~$100 [design, same as the web ads engine]
  qualityRef: 0.35, // CTR curve reference quality; CPI scales inversely with CTR(q)/CTR(ref)
  skan: { iosReport: 0.65, androidReport: 0.92, delay: [1, 3], purchaseDelay: [3, 7] }, // SKAN/AEM: delayed, modeled, noisy iOS attribution [design] (the "8 events" limit is unconfirmed)
  targetD7Roas: 0.5, // D7 ROAS a weekly-plan app should clear before scaling [design]
  scaleStep: 0.5, // a budget increase above +50% before payback is read counts as scaling
  hoursPerCampaign: 1, hoursPerCreative: 0.5,
};
export const CTR_CURVE = [[0, 0.004], [0.35, 0.007], [0.36, 0.008], [0.7, 0.012], [0.71, 0.0125], [0.95, 0.017], [1, 0.022]]; // same hidden-quality curve as growth/params.js

// ---- Channel intent: install-to-paywall-purchase quality by acquisition source (multiplies the paywall start rate) [design] ----
export const INTENT = {
  'ads:meta': 1, 'ads:tiktok': 0.85, 'ads:apple': 1.3, 'ads:google': 1.1,
  'organic:appstore': 1.35, 'organic:ugc': 0.95, 'organic:clips': 0.5, 'organic:social': 0.8, 'organic:wom': 1.2, referral: 1.25, 'organic:seo': 1.0, network: 0.8,
  default: 0.9,
};

export const MISTAKE_FN = 'consumer_app_growth';
