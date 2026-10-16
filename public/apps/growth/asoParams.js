// App Store Optimization parameters (Apple App Store + Google Play). Source of truth: docs/research/seo/aso.md.
// Tags: [P] Apple / Google docs, [V] vendor or data study, [unverified] secondary, [design] game assumption bounded
// by the research. Values tagged [design] or [unverified] must never be shown to players as real statistics.

export const ASO = {
  // Metadata limits [P]: Apple name 30, subtitle 30, keyword field 100 (comma-separated, no spaces), promo text 170
  // (not indexed). Google Play title 30, short description 80, full description 4,000 (full description IS indexed).
  limits: {
    ios: { name: 30, subtitle: 30, keywords: 100, description: 4000 },
    play: { name: 30, subtitle: 80, keywords: 0, description: 4000 },
  },
  // Words Apple tells you not to spend characters on [P: developer.apple.com/app-store/search/]
  genericWords: ['app', 'apps', 'free', 'best', 'top', 'new', 'iphone', 'ipad', 'ios', 'android', 'game', 'games', 'pro', 'the', 'and', 'for', 'with', 'your', 'my'],
  stopWords: ['a', 'an', 'the', 'and', 'or', 'for', 'with', 'to', 'of', 'in', 'on', 'my', 'your', 'by', 'at', 'is', 'it', '&', '-', 'more', 'less', 'all', 'get', 'make', 'very', 'just', 'now', 'every', 'you', 'our', 'we', 'that', 'this'],
  // Well-known app brands: using them in metadata is a guideline 2.3.7 rejection cause [P: App Review Guidelines]
  competitorBrands: ['headspace', 'calm', 'duolingo', 'babbel', 'notion', 'todoist', 'evernote', 'habitica', 'streaks', 'strava', 'myfitnesspal', 'noom', 'fitbod', 'peloton', 'tinder', 'bumble', 'hinge', 'spotify', 'instagram', 'tiktok', 'snapchat', 'whatsapp', 'chatgpt', 'openai', 'gemini', 'copilot', 'canva', 'lightroom', 'vsco', 'picsart', 'facetune', 'mint', 'ynab', 'rocket money', 'goodreads', 'kindle', 'audible', 'blinkist', 'fabulous', 'flo', 'clue', 'netflix', 'youtube', 'google', 'apple', 'microsoft', 'grammarly', 'quizlet', 'photomath', 'chegg'],
  // Pricing / ranking claims: 2.3.7 on Apple, explicitly banned in Play titles [P: Play metadata policy]
  claimTerms: ['#1', 'no.1', 'number one', 'best', 'free', 'cheapest', 'discount', 'sale', '% off', 'no ads', 'top rated', 'editor\'s choice'],

  // ---- Search funnel [design] ----
  // Store search volume per day from a 5-100 popularity score (Apple Ads "search popularity" scale [P]):
  // searches/day = base × 10^(popularity / 22) [design]: popularity 20 ≈ 3/day, 40 ≈ 26/day, 60 ≈ 210/day, 80 ≈ 1,700/day.
  searchBase: { ios: 3, play: 2.7 },
  // Search-result tap-through by rank [design]: the first results take most taps; ranks past ~50 are effectively invisible.
  tapByRank: [[1, 0.35], [2, 0.2], [3, 0.13], [4, 0.09], [5, 0.07], [10, 0.04], [20, 0.015], [50, 0.004], [100, 0.001], [150, 0]],
  unranked: 250, // a newly indexed term starts outside the visible results [design]
  // Ranks move toward their target with this time constant (days): Apple 1-4 weeks to settle after a metadata change,
  // Play faster [design from Apple process, research §6].
  settleDays: { ios: 12, play: 7 },
  // Rank model [design]: strength = fieldWeight × (0.4 + 0.6·fit) × (authority + 25); rank = 6·exp((difficulty − strength)/16).
  rank: { scale: 6, softness: 22, authorityOffset: 15 },
  // Authority from recent install velocity (installs/day, organic + paid), number of ratings and stars [design; Apple
  // names downloads and ratings as signals [P], AppTweak 2025 shows 4★+ apps rank for more keywords [V, correlational]].
  authority: { velocity: 8, ratings: 20, stars: 8 },
  fieldWeight: { name: 1, subtitle: 0.85, keywords: 0.7, description: 0.6 },
  // Product-page conversion (page view → install) for a subscription app [design] bounded by research: 15-35% iOS,
  // 25-45% Play for Health/Productivity; all-category averages 8.56% iOS and 16.15% Play (AppTweak 2025 [V]).
  pageCvr: { ios: 0.27, play: 0.36 },
  // Searchers whose query doesn't describe your app tap and leave: install rate × (0.3 + 0.7·fit) [design].
  fitConv: [0.3, 0.7],
  brand: { base: 1, perAcquired: 0.03, tap: 0.6, conv: 1.3, missingName: 0.3 }, // brand/direct searches [design]
  browse: { perVelocity: 0.05, lowStars: 0.5 }, // charts / category browse views per recent install [design]
  pairRealQuery: { related: 0.3, other: 0.08 }, // share of two-word combinations people actually search [design]
  maxTokens: 30,
  overlapK: 2, // i-th best term counts 1/(1 + i/2): the same searchers type several variants [design]

  // ---- Conversion levers [design] ----
  creative: { base: 0.8, span: 0.4, video: 0.03 }, // CVR × (0.8 + 0.4·screenshot quality) + small video bump
  production: { dev: 0.1, self: 0.5, freelancer: 0.7, agency: 0.85 }, // production quality by who made the set
  screenshotCost: { self: { usd: 0, hours: 12 }, freelancer: { usd: 800, hours: 1.5 }, agency: { usd: 5000, hours: 2 } }, // [V AppFollow: $300-1,500 freelancer, $3-12K agency; 8-16 h DIY]
  videoCost: { usd: 3000, hours: 2 }, // preview video $1,500-10,000 [V AppFollow]
  copy: { base: 0.92, span: 0.16 }, // judged listing copy (aso_listing_review) × CVR [design]
  // Star index on conversion: NP Digital 2024 [V] 5★ 1.00, 4.5★ 0.96, 4★ 0.83, 3★ 0.57; extra ×0.8 below 4.0 [design,
  // practitioner claims]; under ~5 ratings no average is shown [unverified] → ×0.85 [design].
  starIndex: [[1, 0.2], [2, 0.35], [3, 0.57], [4, 0.83], [4.5, 0.96], [5, 1]],
  cliff: { below: 4.0, mult: 0.8 },
  noStars: { minRatings: 5, mult: 0.85 },
  replyCvr: 1.02, // a responsive developer on the page [design; no study]
  maxTestLift: 0.35, // a year of disciplined testing: +15-35% CVR [design]

  // ---- Creative tests [design] ----
  // Apple Product Page Optimization [P]: up to 3 treatments vs the default page, icon/screenshots/previews, ~90 days max
  // [unverified]. Google Play store listing experiments [P]: run at least 7 days.
  test: {
    maxTreatments: 3, maxDays: { ios: 90, play: 60 }, minDays: 7, z: 1.645, // 90% confidence, as App Analytics reports
    minInstalls: 100, holdDays: 3, // enough conversions per arm and a stable result before calling it [design]
    setupHours: 2.5, readHours: 1,
    // True effect of one treatment [design, research §2]: ~60% null/under 5%, ~30% +5-15%, ~10% +15%+; a strong
    // hypothesis (benefit-story captions on a weak page) shifts the odds; some treatments lose.
    outcomes: [[0.15, -0.08], [0.45, 0.01], [0.3, 0.09], [0.1, 0.18]],
  },
  cpp: { tapInstallPts: 0.032, base: 0.555, hours: 4, max: 35 }, // +3.2 pts on 55.5% (AppTweak 2025 [V]); 35 vs 70 limit [unverified]

  // ---- Ratings ----
  promptCap: 3, // SKStoreReviewController: at most 3 prompts per user per 365 days [P]
  repeatPromptYield: [1, 0.4, 0.2], // 2nd and 3rd prompts get fewer responses [design]
  writeReviewLink: 0.001, // a permanent ?action=write-review link (not rate-limited) [P]; yield [design]
  volunteerShift: -0.6, // unprompted ratings skew negative [design]
  replyRevise: { share: 0.1, plus: 2 }, // 5-15% of replied 1-3★ reviewers revise upward [design]
  replyHours: 2, // per week once reviews flow [design: 15-30 min/day]
  // Fake / incentivized reviews: Apple may remove the app or expel the developer [P]; FTC 16 CFR 465 bans buying
  // reviews and sentiment-conditioned incentives, civil penalty ~$51,744 per violation [V, confirm current figure].
  fake: {
    buy: { usdPerReview: 6, hazard: 0.005, filtered: 0.4 }, // review-farm price [unverified]; daily detection hazard [design]
    incentive: { yieldMult: 3, starsTo: 4.8, hazard: 0.003 },
    outcomes: [[0.6, 'purge'], [0.3, 'removed'], [0.1, 'terminated']], // [design]
    removedDays: 45, demoteDays: 30, demoteMult: 0.3,
    // hazard values above are only used for saves made before the shared model: detection odds now come from
    // core/fakereviews.js FAKE.hazard (same appstore rate), and the FTC exposure is rolled there for all schemes.
  },

  // ---- Metadata friction ----
  // Apple: name, subtitle, keywords and screenshots ship with a new app version and pass App Review, typically 1-2 days
  // [design; review time unverified] (we draw 1-3). Play: live within hours to a day [design].
  review: { ios: [1, 3], play: [0, 1] },
  hours: { firstMetadata: 8, refresh: 3, play: 2, promptChange: 1.5, localeHuman: 4, localeMachine: 2, localeAdapted: 6, manualCheck: 0.25, cpp: 4 },
  churnWindow: 30, churnMax: 2, // a 3rd metadata change inside 30 days resets settling: going in circles [design]
  fees: { appleYear: 99, playOnce: 25 }, // Apple Developer Program $99/yr, Play developer account $25 once [P/V]

  // ---- Localization: lift [unverified] (Distimo via Foxdata +128%/country, old); planning +30-100% in that market ----
  locales: {
    es: { label: 'Spanish (Mexico + Spain)', share: 0.1 }, de: { label: 'German', share: 0.07 }, fr: { label: 'French', share: 0.06 },
    pt: { label: 'Portuguese (Brazil)', share: 0.06 }, ja: { label: 'Japanese', share: 0.08 }, ko: { label: 'Korean', share: 0.04 }, it: { label: 'Italian', share: 0.04 },
  }, // share = that market's searches relative to the English storefronts [design]
  // Reach in that market: English-only 0.5, machine-translated 0.6, human 0.85 (+70%), adapted 1.0 (+100%) [design within the
  // +30-100% planning range]. Costs: $150-500 per locale refresh, $2-8K full adaptation [V AppFollow].
  localeQuality: { machine: { q: 0.6, usd: 0 }, human: { q: 0.85, usd: 300 }, adapted: { q: 1, usd: 3000 } },
  englishOnly: 0.5, // English listings still catch some of those markets [design]

  // ---- Apple Search Ads × organic [design, no rigorous study, research §4] ----
  asa: {
    brandCannibal: 0.5, // 30-70% of brand-keyword paid installs would have come organically
    genericCannibal: 0.1, // under 20% on generic / competitor keywords
    // CPT and tap-to-install by category, US 2025 medians (AppTweak [V]); default = SplitMetrics 2026 average $2.25, 66%.
    cpt: { health_fitness: 1.68, meditation_wellness: 1.68, productivity: 1.74, ai_tools: 1.74, education_language: 1.52, photo_video: 1.61, finance: 4.17, dating_social: 1.18, games_entertainment: 2.0 },
    tapInstall: { health_fitness: 0.503, meditation_wellness: 0.503, productivity: 0.565, ai_tools: 0.565, education_language: 0.564, photo_video: 0.675, finance: 0.507, dating_social: 0.548, games_entertainment: 0.6 },
    defaultCpt: 2.25, defaultTapInstall: 0.66,
  },

  // ---- Tools [V vendor pages; Sensor Tower quote-based, estimate unverified] ----
  // Estimates carry error: popularity/difficulty shown = truth × exp(err·z) per term (fixed per tool and term).
  tools: {
    console: { label: 'App Store Connect + Play Console (free)', usd: 0, err: null, ranks: false, competitors: false, note: 'Your own impressions, page views, conversion and test results. No keyword volumes.' },
    appfigures: { label: 'Appfigures (entry)', usd: 7.99, err: 0.5, ranks: true, competitors: false, note: 'Rank tracking for your keywords; rough popularity.' },
    apptweak: { label: 'AppTweak Essential', usd: 89, err: 0.3, ranks: true, competitors: true, note: 'Popularity, difficulty and the top competitors per keyword, one country.' },
    apptweak_grow: { label: 'AppTweak Grow', usd: 299, err: 0.2, ranks: true, competitors: true, note: 'Several countries, competitor tracking, better estimates.' },
    sensortower: { label: 'Sensor Tower (quote, ~$30K/yr)', usd: 2500, err: 0.12, ranks: true, competitors: true, note: 'Market download estimates and the tightest keyword estimates.' },
  },
  // ---- People [V AppFollow, vendor ranges] ----
  help: {
    freelancer: { label: 'ASO freelancer', usd: 2500, testsPerMonth: 1, q: 0.65, note: '$1.5-4K/month' },
    agency: { label: 'Mid-market ASO agency', usd: 8000, testsPerMonth: 2, q: 0.78, note: '$5-15K/month' },
  },
  agencyMinViews: 100, // page views/day below which paid testing rarely reaches significance [design]
};

export const STAGES = [ // research §8 [design]
  { id: 'indie', label: 'Indie ($0-500K ARR)', owner: 'Founder, 2-4 h/week', tools: 'Free consoles + $0-100/month', tests: 'Rarely: low traffic', budget: 'Under $15K/yr' },
  { id: 'seed', label: 'Seed ($0.5-3M ARR)', owner: 'Growth hire or part-time specialist', tools: '$100-600/month', tests: 'One PPO / listing experiment a month', budget: '$25-80K/yr' },
  { id: 'a', label: 'Series A ($3-15M ARR)', owner: 'ASO manager or pod', tools: '$1,000-5,000/month', tests: 'CPPs per ad group, 2+ concurrent tests', budget: '$80-250K/yr' },
];

// Category vocabulary: words people use when searching for apps of this kind [design].
export const CATEGORY_WORDS = {
  health_fitness: ['workout', 'fitness', 'exercise', 'gym', 'training', 'steps', 'weight', 'run', 'running', 'yoga', 'health', 'diet', 'calorie', 'habit', 'tracker', 'home', 'strength', 'cardio', 'coach'],
  meditation_wellness: ['meditation', 'sleep', 'calm', 'anxiety', 'stress', 'mindfulness', 'breathing', 'relax', 'journal', 'mood', 'wellness', 'therapy', 'focus', 'habit', 'self', 'care'],
  productivity: ['todo', 'task', 'tasks', 'planner', 'calendar', 'notes', 'reminder', 'habit', 'tracker', 'focus', 'timer', 'list', 'schedule', 'organizer', 'goals', 'routine', 'daily', 'productivity'],
  ai_tools: ['ai', 'assistant', 'chat', 'writer', 'writing', 'generator', 'photo', 'image', 'voice', 'summary', 'notes', 'translate', 'editor', 'scan'],
  education_language: ['learn', 'language', 'spanish', 'english', 'reading', 'books', 'kids', 'math', 'study', 'flashcards', 'vocabulary', 'quiz', 'course', 'lessons', 'practice', 'school'],
  photo_video: ['photo', 'editor', 'video', 'filter', 'collage', 'camera', 'edit', 'reels', 'presets', 'retouch', 'background', 'maker'],
  finance: ['budget', 'money', 'expense', 'tracker', 'spending', 'savings', 'bills', 'finance', 'invest', 'debt', 'planner', 'bank', 'personal'],
  dating_social: ['dating', 'meet', 'friends', 'chat', 'singles', 'match', 'social', 'community', 'love', 'date'],
  games_entertainment: ['game', 'puzzle', 'stories', 'music', 'podcast', 'trivia', 'play', 'fun', 'quiz', 'word'],
};
