// Customer types: WHO the company sells to, chosen at setup and changed by moving upmarket. Pure data.
//
// Research (dated sources, [design] and [unverified] flags): docs/research/customer-types/a-startups.md,
// b-mom-and-pop.md, c-ecommerce.md, d-upmarket.md. Logic lives in core/customer-type.js.
//
// Conventions
// - Every multiplier is relative to the business model's baseline (core/params.js MARKET[model]) = 1.
// - Almost every number here is [design]: a planning value chosen from the research ranges. The few sourced anchors are
//   listed in `sourced`. Never show a multiplier to players as a real statistic; the UI shows the research ranges in
//   `facts` (which carry their own status) and the playbook text.
// - `model` is the core business model the type runs on. Moving upmarket from an SMB type switches the company to 'ent'.
// - Channel ids (CHANNELS) are what `channelOf(source)` maps Stripe/CRM attribution sources onto.

export const CHANNELS = {
  seo: 'SEO, programmatic pages, AI search',
  content: 'Founder content, social, PR, creators',
  community: 'Communities (Slack, Reddit, Facebook groups)',
  product_hunt: 'Launch sites (Product Hunt, Hacker News)',
  ads_google: 'Google Ads',
  ads_meta: 'Meta / TikTok / Reddit ads',
  ads_linkedin: 'LinkedIn ads',
  outbound_email: 'Cold email and AI SDRs',
  outbound_phone: 'Cold calling',
  partners: 'Resellers, agencies, consultants',
  marketplace: 'App stores, marketplaces, review sites',
  referral: 'Referrals, word of mouth, affiliates',
  events: 'Events, conferences, webinars',
  local: 'Local and door-to-door',
};

// Attribution source -> channel id. Sources not listed (network, inbound, direct, competitor-switch: no marketing channel
// reached them, they came by themselves or from a rival's failure) are neutral. Apple Search Ads is intent search like
// Google Search; an owned list / newsletter and press are content channels [design].
export const SOURCE_CHANNEL = [
  [/^ads:(google|apple)/, 'ads_google'], [/^ads:(meta|tiktok|reddit)/, 'ads_meta'], [/^ads:linkedin/, 'ads_linkedin'],
  [/^(organic:(seo|pseo|llm|template|tool)|ai_search|directories|free_tools)/, 'seo'],
  [/^(organic:(social|clips|ugc|list)|creator|sponsorship|newsletter|pr|press|webinar)$/, 'content'],
  [/^(organic:community|community)$/, 'community'],
  [/^(product-hunt|organic:hn|organic:ph)$/, 'product_hunt'],
  [/^(referral|organic:(wom|viral)|affiliate|plg)$/, 'referral'],
  [/^(partner|agency|organic:agency)$/, 'partners'],
  [/^(marketplace:|organic:appstore|aso|review_sites|ltd)/, 'marketplace'],
  [/^(outbound|ai_sdr|sequence|direct_mail)$/, 'outbound_email'],
  [/^cold_call$/, 'outbound_phone'],
  [/^events$/, 'events'],
  [/^(local|door_to_door|field)$/, 'local'],
];

const ch = (o) => Object.fromEntries(Object.keys(CHANNELS).map((k) => [k, o[k] ?? 1]));

// Table-stakes features each type expects before it buys or stays: keyword groups matched against shipped Product
// features (title + problem + spec). Missing ones lower trial conversion and raise "missing feature" churn [design].
const stake = (id, label, keywords) => ({ id, label, keywords });

export const CUSTOMER_TYPES = {
  startups: {
    label: 'Startups and tech companies',
    short: 'Startups',
    model: 'smb',
    blurb: 'VC-backed and bootstrapped tech teams (5-200 people, SF/NYC style). Engineers and founders try it themselves, pay by card, talk on X and Slack, and churn when they die, pivot, get acquired or build it in-house.',
    segmentIds: ['startup_smb', 'agencies', 'mid_market'],
    defaultSegment: 'startup_smb',
    // Market overrides on MARKET.smb. Startups: lower steady churn (~2%/mo) but a startup-death floor; trials convert a
    // bit better (opt-in 15%, card 40%: a-startups.md §1); prefer self-serve; card spend limits on Brex/Ramp.
    market: { refPriceMult: 1.25, trialStartMult: 1.2, trialToPaidMult: 1.0, churnMult: 0.7, annualRenewal: 0.78, annualShare: 0.25, elasticity: 0.55 },
    onboarding: { self: 1.1, call: 0.65, concierge: 0.5, best: 'self' }, // engineers want to try it now: calls add almost nothing over self-serve (x the generic ONBOARDING lift) but cost founder hours
    channels: ch({ seo: 1.3, content: 1.4, community: 1.6, product_hunt: 1.2, ads_google: 0.8, ads_meta: 0.3, ads_linkedin: 0.6, outbound_email: 0.7, outbound_phone: 0.2, partners: 0.6, marketplace: 1.2, referral: 1.8, events: 0.7, local: 0 }),
    support: { ticketsMult: 0.8, frtToleranceHours: 2, expects: 'shared Slack channel, GitHub issues, docs and a changelog', technical: true },
    payments: { failMult: 0.6, disputeMult: 0.5, note: 'Corporate cards (Brex, Ramp) with per-transaction limits; invoice and net-30 above ~$5k.' },
    macro: { churnSensitivity: 1.8, signupSensitivity: 1.6, label: 'Funding climate. In a funding winter startup customers die, freeze hiring and cut tools, many in the same quarter.' },
    seasonality: { churn: { 12: 1.15, 1: 1.1 }, note: 'Budget resets in January; Q4 tool audits.' },
    expansion: { mult: 1.6, note: 'Seats grow as customers hire; NRR 100-108% when the plan is seat-based.' },
    graduation: { outgrowMonthly: 0.006, needs: ['sso', 'audit_log', 'roles'], note: 'Startups that grow past ~100 people need SSO, audit logs and roles; without them they leave for enterprise tools.' },
    tableStakes: [
      stake('integrations', 'Slack / GitHub / Linear or Google Workspace integration', ['slack', 'github', 'linear', 'google workspace', 'jira', 'notion', 'zapier', 'webhook']),
      stake('api', 'Public API and docs', ['api', 'docs', 'sdk', 'webhook', 'cli']),
    ],
    vc: { label: 'Selling to startups', note: 'Investors like the speed and word of mouth but discount correlated churn: your customers die in the same downturn. They ask whether you can follow customers upmarket.', oddsMult: 1.0 },
    mistakes: { badChannels: ['outbound_phone', 'ads_meta', 'local'] },
    playbook: [
      'Self-serve trial or free tier, a 5-minute setup and real docs. No forced demo below ~$5k ACV.',
      'Launch on Product Hunt / Hacker News, post in founder and engineering communities, write technical content.',
      'Support in a shared Slack channel within a couple of business hours; publish a changelog.',
      'Ship the integrations they live in (Slack, GitHub, Google Workspace) and an API.',
      'Seat-based or usage pricing that grows as they hire; startup discount programs work.',
      'Plan for correlated churn: in a funding winter many customers disappear at once.',
    ],
    facts: [
      'Carta counted 966 US startup shutdowns in 2024 vs 769 in 2023 (+25.6%) [secondary, a-startups.md]',
      'Opt-in trials convert ~18% and card-required ~49% in B2B SaaS benchmarks [unverified, a-startups.md]',
      'Cold email to founders and engineers: ~3% replies, 6% when well personalized [secondary/design]',
    ],
    sourced: ['docs/research/customer-types/a-startups.md'],
  },

  local_smb: {
    label: 'Mom-and-pop and local businesses',
    short: 'Local SMBs',
    model: 'smb',
    blurb: 'Owner-operated restaurants, salons, trades, shops and clinics. The owner decides alone, is busy serving customers during the day, wants a phone call and someone to set it up, and pays monthly by card. Many close each year.',
    segmentIds: ['retail_shops', 'restaurants', 'salons_fitness', 'trades', 'trucking', 'health_practices', 'real_estate', 'accounting_firms', 'law_firms', 'churches', 'nonprofits', 'franchise_systems'],
    defaultSegment: 'retail_shops',
    // Lower price points, very low self-serve trial starts, onboarding decides activation. 2.5%/mo baseline churn with
    // a heavy early "never adopted" hump; closures alone ~1%/mo (BLS year-one exit ~22%) (b-mom-and-pop.md).
    market: { refPriceMult: 0.75, trialStartMult: 0.6, trialToPaidMult: 0.85, churnMult: 0.95, earlyChurnMult: 1.35, annualRenewal: 0.7, annualShare: 0.15, elasticity: 0.95 },
    onboarding: { self: 0.7, call: 1.15, concierge: 1.35, best: 'concierge' }, // done-for-you setup is the product for owners
    channels: ch({ seo: 1.3, content: 0.8, community: 1.4, product_hunt: 0.1, ads_google: 1.2, ads_meta: 1.0, ads_linkedin: 0.1, outbound_email: 0.2, outbound_phone: 1.1, partners: 1.6, marketplace: 1.0, referral: 1.8, events: 0.9, local: 1.2 }),
    support: { ticketsMult: 1.5, frtToleranceHours: 4, expects: 'a phone number, after-hours help and someone who sets it up for them', technical: false },
    payments: { failMult: 1.6, disputeMult: 1.8, note: 'Personal and small-business debit cards that fail often; dunning, a card updater and an ACH fallback recover much of it.' },
    macro: { churnSensitivity: 1.5, signupSensitivity: 1.4, label: 'Main Street economy. Recessions, inflation and tariffs close shops and make owners cut every subscription they can.' },
    seasonality: { churn: { 1: 1.3, 2: 1.15, 11: 0.9, 12: 0.9 }, note: 'Closures and cost cuts cluster after the holidays; owners have no time in their busy season.' },
    expansion: { mult: 0.35, note: 'Little expansion; NRR ~90% unless you attach payments or add locations.' },
    graduation: { outgrowMonthly: 0.001, needs: ['multi_location'], note: 'Owners who open a second or third location need multi-location reporting.' },
    tableStakes: [
      stake('mobile', 'Works on a phone', ['mobile', 'phone', 'ios', 'android', 'app', 'sms', 'text message']),
      stake('accounting', 'QuickBooks / Square / Google Business integration', ['quickbooks', 'square', 'xero', 'google business', 'clover', 'toast', 'stripe']),
    ],
    vc: { label: 'Selling to mom-and-pops', note: 'Investors fear low ACV and high churn but love huge TAM; vertical SaaS with embedded payments is the bull case.', oddsMult: 0.9 },
    mistakes: { badChannels: ['ads_linkedin', 'outbound_email', 'product_hunt'] },
    playbook: [
      'Phone and in-person beat email: owners do not answer cold email or LinkedIn. Call outside service hours.',
      'Done-for-you onboarding: import their data and set it up on a call. Self-serve-only activation is poor.',
      'Google search, local SEO, Facebook groups, trade associations and resellers/consultants they already trust.',
      'Answer the phone. Owners work evenings and weekends and churn after one bad support experience.',
      'Monthly plans, simple flat pricing, no long annual contracts (they cause chargebacks).',
      'Expect closures: a share of customers churn every month no matter what you do. Dunning matters.',
    ],
    facts: [
      'About 22% of new establishments exit within a year (BLS business employment dynamics) [primary, b-mom-and-pop.md]',
      'Cold email to owners: ~0.5-1.5% reply; phone connects 6-10% per dial [secondary]',
      'Payments-attached vertical SaaS reaches ~110% NRR (Toast, ServiceTitan filings) [primary]',
    ],
    sourced: ['docs/research/customer-types/b-mom-and-pop.md', 'docs/research/buyer-segments/g1-retail-restaurants-salons.md'],
  },

  ecommerce: {
    label: 'Online stores and e-commerce brands',
    short: 'E-commerce',
    model: 'smb',
    blurb: 'Shopify merchants, Amazon sellers and DTC brands. They install from an app store, judge you by reviews and attributed revenue, need help fast (especially at Black Friday) and churn when stores close or Shopify ships the feature natively.',
    segmentIds: ['ecommerce', 'retail_shops', 'agencies'],
    defaultSegment: 'ecommerce',
    // Higher churn (5%/mo, early cohorts ~2x), app-store installs start easily, Q4 freeze and January churn (c-ecommerce.md).
    market: { refPriceMult: 0.9, trialStartMult: 1.3, trialToPaidMult: 1.05, churnMult: 1.45, earlyChurnMult: 1.3, annualRenewal: 0.65, annualShare: 0.1, elasticity: 0.8 },
    onboarding: { self: 1.0, call: 1.1, concierge: 1.1, best: 'call' },
    channels: ch({ seo: 1.0, content: 1.1, community: 1.4, product_hunt: 0.4, ads_google: 0.9, ads_meta: 1.0, ads_linkedin: 0.3, outbound_email: 0.6, outbound_phone: 0.3, partners: 1.6, marketplace: 2.0, referral: 1.3, events: 0.7, local: 0 }),
    support: { ticketsMult: 1.2, frtToleranceHours: 2, expects: 'live chat, fast answers and same-day help during Black Friday / Cyber Monday', technical: false, peakMonths: [11, 12] },
    payments: { failMult: 1.0, disputeMult: 1.0, note: 'Billed through the Shopify invoice for app-store apps (0% revenue share on the first $1M, then 15%).' },
    macro: { churnSensitivity: 1.3, signupSensitivity: 1.25, label: 'Consumer demand, ad costs and tariffs. DTC downturns close stores and trigger app-stack audits.' },
    seasonality: { churn: { 1: 1.45, 2: 1.15, 10: 0.85, 11: 0.75, 12: 0.85 }, signups: { 10: 0.8, 11: 0.6, 12: 0.7, 1: 1.3 }, note: 'Merchants freeze changes before Black Friday; January brings the churn wave and the install wave.' },
    expansion: { mult: 1.3, note: 'GMV or order-based pricing grows with the store; winners reach 105-115% NRR (Klaviyo 110%).' },
    graduation: { outgrowMonthly: 0.002, needs: ['multi_store'], note: 'Brands moving to Shopify Plus need multi-store and agency access.' },
    tableStakes: [
      stake('shopify', 'Shopify (or Amazon / WooCommerce) integration', ['shopify', 'woocommerce', 'amazon', 'bigcommerce', 'tiktok shop', 'storefront']),
      stake('stack', 'Works with Klaviyo / Gorgias / Recharge', ['klaviyo', 'gorgias', 'recharge', 'attentive', 'postscript', 'yotpo']),
    ],
    vc: { label: 'Selling to e-commerce merchants', note: 'Investors worry about platform risk (Shopify ships it natively) and high merchant churn; GMV-linked pricing is the bull case.', oddsMult: 0.9 },
    mistakes: { badChannels: ['ads_linkedin', 'outbound_phone', 'local'] },
    playbook: [
      'The app store is the main channel: listing, ranking, reviews and the Built for Shopify badge.',
      'Agencies and Shopify partners decide for many brands; give them a partner plan and client reports.',
      'Price on orders, GMV or usage, not seats. Show attributed revenue in the app.',
      'Chat support within minutes; never ship big changes during the Black Friday freeze.',
      'Expect a January churn wave and plan the year around Q4.',
      'Watch Shopify itself: a native feature can wipe out a category overnight.',
    ],
    facts: [
      'Shopify App Store: 0% revenue share on the first $1M of lifetime app revenue, 15% above [primary, c-ecommerce.md]',
      'Built for Shopify needs 50+ net paid installs, 5+ reviews and storefront speed limits [primary]',
      'Klaviyo reported ~110% NRR at the end of 2025 [primary]',
    ],
    sourced: ['docs/research/customer-types/c-ecommerce.md'],
  },

  mid_market: {
    label: 'Mid-market companies (100-1,000 employees)',
    short: 'Mid-market',
    model: 'ent',
    blurb: 'Departments with their own budget, a buying group of 4-7 people, security questionnaires, SSO, invoices and annual contracts. Fewer, bigger deals and much lower churn.',
    segmentIds: ['mid_market', 'general_contractors', 'hotels', 'franchise_systems', 'manufacturing', 'banks', 'insurance', 'law_firms', 'accounting_firms', 'k12', 'higher_ed', 'local_gov'],
    defaultSegment: 'mid_market',
    // ent model baseline is ~$15k ACV; mid-market median ~$40k is the upmarket target (d-upmarket.md): churn 1.2%/mo.
    market: { refPriceMult: 1.6, trialStartMult: 1.0, trialToPaidMult: 1.0, churnMult: 1.15, annualRenewal: 0.86, annualShare: 0.7, elasticity: 0.5 },
    onboarding: { self: 0.8, call: 1.1, concierge: 1.2, best: 'concierge' },
    channels: ch({ seo: 0.8, content: 0.9, community: 0.6, product_hunt: 0.2, ads_google: 0.7, ads_meta: 0.2, ads_linkedin: 1.1, outbound_email: 0.9, outbound_phone: 1.0, partners: 1.3, marketplace: 1.0, referral: 1.3, events: 1.2, local: 0 }),
    support: { ticketsMult: 1.0, frtToleranceHours: 4, expects: 'a named contact, a 4-hour business-day SLA and an onboarding plan', technical: false },
    payments: { failMult: 0.4, disputeMult: 0.3, note: 'Mostly invoices on net 30-60 with a PO; ~10% pay by card.' },
    macro: { churnSensitivity: 1.0, signupSensitivity: 1.0, label: 'Budget cycles. Freezes lengthen deals and push renewals to procurement.' },
    seasonality: { churn: {}, note: 'Budgets are set in Q4; renewals cluster at fiscal year end.' },
    expansion: { mult: 1, note: 'NRR ~104%: expansion comes from land-and-expand (Success).' },
    graduation: { outgrowMonthly: 0, needs: [] },
    tableStakes: [
      stake('sso', 'SSO (SAML / Okta)', ['sso', 'saml', 'single sign-on', 'okta', 'scim']),
      stake('roles', 'Roles and permissions', ['role', 'permission', 'rbac', 'admin console', 'access control']),
    ],
    vc: { label: 'Selling to mid-market', note: 'Investors like higher ACV and NRR but want to see repeatable sales, not founder heroics.', oddsMult: 1.05 },
    mistakes: { badChannels: ['ads_meta', 'product_hunt', 'local'] },
    playbook: [
      'Founder sells the first 10 deals before hiring an AE; multi-thread every deal.',
      'SOC 2 Type I in hand (Type II under way), SSO, roles, a DPA and an MSA template before the first security review.',
      'Two or three referenceable logos and case studies; an enterprise tier priced as a contract, not a card checkout.',
      'Keep the SMB motion running separately; neglecting it stalls self-serve growth.',
    ],
    facts: [
      'SaaS Capital 2025: median NRR ~102% at $25-50k ACV, rising with ACV [primary, d-upmarket.md]',
      'First AE ramps 4-6 months; first-AE failure is 40-60% when hired before 10-20 founder-closed deals [design from secondary]',
    ],
    sourced: ['docs/research/customer-types/d-upmarket.md', 'docs/research/buyer-segments/g5-companies.md'],
  },

  enterprise: {
    label: 'Enterprise (1,000+ employees)',
    short: 'Enterprise',
    model: 'ent',
    blurb: 'Buying groups of 7-16, procurement, SOC 2 Type II, pen tests, MSA redlines, net 60-90 and 6-18 month cycles. Very sticky once in, and a single logo can be 20% of revenue.',
    segmentIds: ['enterprise', 'mid_market', 'banks', 'insurance', 'hospitals', 'pharma', 'manufacturing', 'utilities', 'state_gov', 'federal', 'higher_ed'],
    defaultSegment: 'enterprise',
    market: { refPriceMult: 5, trialStartMult: 0.6, trialToPaidMult: 1.0, churnMult: 0.5, annualRenewal: 0.93, annualShare: 0.95, elasticity: 0.4 },
    onboarding: { self: 0.6, call: 1.0, concierge: 1.3, best: 'concierge' },
    channels: ch({ seo: 0.3, content: 0.6, community: 0.3, product_hunt: 0.05, ads_google: 0.3, ads_meta: 0.1, ads_linkedin: 1.0, outbound_email: 0.7, outbound_phone: 0.9, partners: 1.6, marketplace: 0.9, referral: 1.2, events: 1.5, local: 0 }),
    support: { ticketsMult: 1.0, frtToleranceHours: 1, expects: 'a named CSM, a 1-hour P1 SLA, a status page and quarterly business reviews', technical: false },
    payments: { failMult: 0.2, disputeMult: 0.1, note: 'Invoices only, net 60-90, vendor portals; almost nobody pays by card.' },
    macro: { churnSensitivity: 0.8, signupSensitivity: 1.4, label: 'Enterprise budgets. Downturns stretch new-deal cycles but rarely cancel contracts mid-term.' },
    seasonality: { churn: {}, note: 'Deals close at quarter and fiscal year end.' },
    expansion: { mult: 1, note: 'NRR ~115%: expansion comes from new departments (Success land and expand).' },
    graduation: { outgrowMonthly: 0, needs: [] },
    tableStakes: [
      stake('sso', 'SSO and SCIM provisioning', ['sso', 'saml', 'single sign-on', 'okta', 'scim']),
      stake('audit_log', 'Audit logs', ['audit log', 'audit trail', 'activity log', 'audit']),
      stake('roles', 'Roles, permissions and an admin console', ['role', 'permission', 'rbac', 'admin console', 'access control']),
    ],
    vc: { label: 'Selling to enterprise', note: 'Investors pay for enterprise NRR and logos but discount customer concentration and 9-18 month cycles.', oddsMult: 1.05 },
    mistakes: { badChannels: ['ads_meta', 'product_hunt', 'community', 'local'] },
    playbook: [
      'SOC 2 Type II, a pen test, SSO/SCIM, audit logs and data residency answers are entry tickets, not features.',
      'Map the buying group early; procurement and security start in month one, not after the champion says yes.',
      'Partners (SIs, resellers, marketplaces) and events open more doors than ads.',
      'Never let one customer pass ~20% of revenue without a plan; it cuts valuation and one churn costs the quarter.',
    ],
    facts: [
      'Enterprise buying groups: 5-16 people across up to 4 functions (Gartner 2025) [primary, buyer-segments.md]',
      'No SOC 2: security review adds 4-10 weeks and loses about half of enterprise opportunities [design from secondary, d-upmarket.md]',
    ],
    sourced: ['docs/research/customer-types/d-upmarket.md'],
  },

  consumers: {
    label: 'Consumers',
    short: 'Consumers',
    model: 'b2c',
    blurb: 'Individuals paying for an app. Ads, creatives, app stores and retention curves.',
    segmentIds: [], defaultSegment: null,
    market: {}, onboarding: { self: 1, call: 1, concierge: 1, best: 'self' }, channels: ch({}),
    support: { ticketsMult: 1, frtToleranceHours: 24, expects: 'in-app help and fast refunds' }, payments: { failMult: 1, disputeMult: 1 },
    macro: { churnSensitivity: 1, signupSensitivity: 1, label: 'Consumer spending.' }, seasonality: { churn: {} }, expansion: { mult: 1 }, graduation: { outgrowMonthly: 0, needs: [] },
    tableStakes: [], vc: { label: 'Consumer', note: '', oddsMult: 1 }, mistakes: { badChannels: [] }, playbook: [], facts: [], sourced: [],
  },
};

// Which types can be picked for each business model at setup (null = "mixed / not sure": model baseline only).
export const TYPES_BY_MODEL = { b2c: ['consumers'], smb: ['startups', 'local_smb', 'ecommerce'], ent: ['mid_market', 'enterprise'] };

// Moving upmarket: SMB types -> mid-market -> enterprise. Prerequisites and penalties from d-upmarket.md (§ transition).
export const UPMARKET = {
  ladder: { startups: 'mid_market', local_smb: 'mid_market', ecommerce: 'mid_market', mid_market: 'enterprise' },
  // Readiness checks (each 0/1, weighted). Thresholds are [design] game-scale versions of "ARR $1-3M, 2-3 logos".
  checks: {
    mid_market: [
      { id: 'traction', label: 'At least $15k MRR from paying customers', weight: 1, mrr: 15000 },
      { id: 'references', label: 'Two or more customers paying $500+/month for 6+ months (references)', weight: 1.5, refs: 2, refMrr: 500 },
      { id: 'sso', label: 'SSO (SAML) shipped', weight: 1, feature: 'sso' },
      { id: 'roles', label: 'Roles and permissions shipped', weight: 0.5, feature: 'roles' },
      { id: 'soc2', label: 'SOC 2 started (Type I report or audit under way)', weight: 1, soc2: 'started' },
      { id: 'plan', label: 'A contract plan priced at $6k+/year (annual)', weight: 1, planAnnual: 6000 },
    ],
    enterprise: [
      { id: 'traction', label: 'At least $80k MRR', weight: 1, mrr: 80000 },
      { id: 'references', label: 'Three or more customers paying $3k+/month for 6+ months', weight: 1.5, refs: 3, refMrr: 3000 },
      { id: 'sso', label: 'SSO / SCIM shipped', weight: 0.75, feature: 'sso' },
      { id: 'audit_log', label: 'Audit logs shipped', weight: 0.75, feature: 'audit_log' },
      { id: 'roles', label: 'Roles and admin console shipped', weight: 0.5, feature: 'roles' },
      { id: 'soc2', label: 'SOC 2 report on hand', weight: 1.5, soc2: 'report' },
      { id: 'plan', label: 'An enterprise plan priced at $50k+/year', weight: 1, planAnnual: 50000 },
    ],
  },
  readyAt: 0.75, // weighted share of checks passed to count as ready [design]
  hours: { mid_market: 24, enterprise: 40 }, // repositioning: website, pricing page, deck, security pack, sales process [design]
  // Penalties scale with (readyAt - readiness) / readyAt. Ranges from d-upmarket.md premature-push penalties.
  premature: { maxDealWinPenalty: 0.5, maxCycleDays: 70, maxConversionPenalty: 0.35, days: 270 },
  // Legacy SMB customers after the move: churn multiplier while no self-serve plan (< $500/mo) stays active [design;
  // research: SMB churn +0.5 pt/month while ignored, self-serve growth -30-50%].
  smbNeglectChurnMult: 1.35, selfServeMaxMonthly: 500,
};

// Feature keyword groups used by graduation needs and readiness checks.
export const FEATURE_KEYWORDS = {
  sso: ['sso', 'saml', 'single sign-on', 'okta', 'scim'],
  audit_log: ['audit log', 'audit trail', 'activity log'],
  roles: ['role', 'permission', 'rbac', 'admin console', 'access control'],
  multi_location: ['multi-location', 'multiple locations', 'multi location', 'franchise', 'locations'],
  multi_store: ['multi-store', 'multiple stores', 'multi store', 'shopify plus', 'agency access'],
};
