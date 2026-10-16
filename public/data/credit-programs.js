// Startup credit and perk programs, 2026. DATA ONLY. Source: docs/research/ops-2026/startup-credits.md, which was built
// from search snippets and aggregator pages, not from official terms: nearly every amount and eligibility rule below is a
// planning range ([unverified]). Approval odds, hours, delays and expiry are [design]. Never present them to players as
// verified program terms; the UI says "reported" and tells the player to check the official page.
//
// route: how the tier is reached. 'self' = open application; 'referral' = needs a partner referral (VC, accelerator or
// an Activate-style provider); 'accelerator' = needs an enrolled/accepted accelerator; 'vc' = needs institutional funding.
// alloc: credits from different marketplaces can be the same underlying allocation, so one alloc is paid once.
// covers: bill categories the balance offsets. A cloud/lab balance only offsets bills posted to its provider; a SaaS
// balance only offsets recurring bills whose vendor matches `vendor`.

export const PROGRAMS = [
  {
    id: 'aws_activate', name: 'AWS Activate', group: 'Cloud', kind: 'cloud', provider: 'aws', covers: ['hosting', 'ai_inference'], alloc: 'aws',
    note: 'Founders is self-serve (~$1,000, reported ceilings to ~$5,000). Portfolio goes through an Activate Provider (VC, accelerator, incubator): up to $100k-$200k reported. Marketplace purchases and some GPU families are excluded.',
    requires: { website: true, domain: true, linkedin: true },
    tiers: [
      { id: 'founders', label: 'Founders (self-serve)', amount: 1000, months: 12, route: 'self', hours: 0.75, delay: [2, 8], odds: 0.85 },
      { id: 'founders_plus', label: 'Founders, verified (up to ~$5k)', amount: 5000, months: 12, route: 'self', hours: 1.5, delay: [5, 14], odds: 0.6, needs: { product: true } },
      { id: 'portfolio_seed', label: 'Portfolio, via a VC / accelerator provider', amount: 25000, months: 24, route: 'referral', hours: 2.5, delay: [14, 40], odds: 0.75, needs: { backed: true } },
      { id: 'portfolio_top', label: 'Portfolio, top tier (reported up to $100k-$200k)', amount: 100000, months: 24, route: 'referral', hours: 4, delay: [21, 60], odds: 0.5, needs: { backed: true, raisedMin: 500000 } },
    ],
  },
  {
    id: 'google_cloud', name: 'Google for Startups Cloud', group: 'Cloud', kind: 'cloud', provider: 'google', covers: ['hosting', 'ai_inference'], alloc: 'google',
    note: 'Start tier ~$2,000 over a year; Scale up to ~$200k over two years (year-two coverage drops to ~20%); AI-first up to $350k over two years for funded AI-first companies using Vertex AI / Gemini, under $5k of prior Google Cloud credits.',
    requires: { website: true, domain: true, linkedin: true },
    tiers: [
      { id: 'start', label: 'Start (self-serve, ~$2k)', amount: 2000, months: 12, route: 'self', hours: 0.75, delay: [2, 10], odds: 0.85 },
      { id: 'scale', label: 'Scale (partner investor / accelerator)', amount: 100000, months: 24, route: 'referral', hours: 3, delay: [21, 50], odds: 0.55, needs: { backed: true, raisedMin: 250000 } },
      { id: 'ai_first', label: 'AI-first (up to ~$350k)', amount: 250000, months: 24, route: 'vc', hours: 5, delay: [28, 70], odds: 0.4, needs: { backed: true, raisedMin: 500000, aiFirst: true, maxAgeYears: 10 } },
    ],
  },
  {
    id: 'microsoft_hub', name: 'Microsoft for Startups Founders Hub', group: 'Cloud', kind: 'cloud', provider: 'azure', covers: ['hosting', 'ai_inference'], alloc: 'azure',
    note: 'Open to ideation-stage founders with no funding. Entry credits ~$1,000 (to ~$5,000 verified); the headline ~$150k Azure is gated by an investor-network referral. Reported expiry: first credits 90 days, later 180 days, forfeited if unused. OpenAI access is Azure OpenAI billed against Azure credits.',
    requires: { website: true, domain: true, linkedin: true },
    tiers: [
      { id: 'entry', label: 'Entry (no funding needed)', amount: 1000, months: 3, route: 'self', hours: 0.5, delay: [1, 5], odds: 0.9 },
      { id: 'verified', label: 'Verified (to ~$5k)', amount: 5000, months: 6, route: 'self', hours: 1.25, delay: [5, 14], odds: 0.6, needs: { product: true } },
      { id: 'investor', label: 'Investor network (to ~$150k)', amount: 100000, months: 12, route: 'referral', hours: 3, delay: [21, 60], odds: 0.5, needs: { backed: true, raisedMin: 250000 } },
    ],
  },
  {
    id: 'anthropic_startups', name: 'Anthropic startup program', group: 'AI labs', kind: 'lab', provider: 'anthropic', covers: ['ai_inference'], alloc: 'anthropic',
    note: 'Aggregators report a direct tier ($1k-$5k), a referred tier ($5k-$25k) and a VC-nominated top tier (to ~$100k); no public checklist. Credits apply to the first-party API console, not Bedrock or Vertex. Typical term 6-12 months.',
    requires: { website: true, domain: true, linkedin: true },
    tiers: [
      { id: 'direct', label: 'Direct application', amount: 2500, months: 6, route: 'self', hours: 1, delay: [3, 14], odds: 0.55 },
      { id: 'referred', label: 'Referred (partner / investor)', amount: 15000, months: 12, route: 'referral', hours: 2, delay: [10, 35], odds: 0.65, needs: { backed: true } },
      { id: 'nominated', label: 'VC-nominated top tier', amount: 100000, months: 12, route: 'vc', hours: 3, delay: [21, 60], odds: 0.45, needs: { backed: true, raisedMin: 500000, aiFirst: true } },
    ],
  },
  {
    id: 'openai_startups', name: 'OpenAI for Startups', group: 'AI labs', kind: 'lab', provider: 'openai', covers: ['ai_inference'], alloc: 'openai',
    note: 'No broad self-serve grant found in 2026: credits sit behind named VC partners; Ramp offers reportedly unlock ~$2,500. The cohort program with $50k credits had closed applications.',
    // businessBank sits in `requires` (eligibility() also honours a tier-level needs.businessBank): the card/bank perk needs a business account,
    // and a VC-backed company already has one.
    requires: { website: true, domain: true, businessBank: true },
    tiers: [
      { id: 'partner_offer', label: 'Partner offer (card / bank perk)', amount: 2500, months: 12, route: 'self', hours: 0.5, delay: [1, 7], odds: 0.8 },
      { id: 'vc_partner', label: 'VC-partner credits', amount: 25000, months: 12, route: 'vc', hours: 2.5, delay: [21, 50], odds: 0.55, needs: { backed: true, raisedMin: 500000 } },
    ],
  },
  {
    id: 'nvidia_inception', name: 'NVIDIA Inception', group: 'Cloud', kind: 'membership', provider: null, covers: [],
    note: 'Free membership, no equity. Benefits are preferred hardware pricing and training; cloud GPU credits come from partners (AWS Activate, other clouds) at amounts they set. In the game, membership is a plus on cloud partner applications, not cash.',
    requires: { website: true, domain: true },
    tiers: [{ id: 'member', label: 'Membership (no credits of its own)', amount: 0, months: 12, route: 'self', hours: 1, delay: [3, 10], odds: 0.8, perk: 'inception' }],
  },
  {
    id: 'cloudflare', name: 'Cloudflare for Startups', group: 'Cloud', kind: 'cloud', provider: 'cloudflare', covers: ['hosting'], alloc: 'cloudflare',
    note: 'Largest reported figure, up to ~$250k across the developer platform and some enterprise protections.',
    requires: { website: true, domain: true },
    tiers: [
      { id: 'startup', label: 'Startup (self-serve)', amount: 5000, months: 12, route: 'self', hours: 0.75, delay: [3, 12], odds: 0.75 },
      { id: 'partner', label: 'Partner-referred', amount: 50000, months: 12, route: 'referral', hours: 2, delay: [14, 40], odds: 0.6, needs: { backed: true } },
    ],
  },
  {
    id: 'vercel', name: 'Vercel', group: 'Cloud', kind: 'saas', vendor: 'vercel', covers: ['hosting', 'software'], alloc: 'vercel',
    tool: { vendor: 'Vercel', monthly: 20, category: 'hosting' },
    note: 'Standard program up to ~$30k of credits; an AI Accelerator route is reported far higher from a secondary source.',
    requires: { website: true, domain: true },
    tiers: [
      { id: 'standard', label: 'Startup program', amount: 2400, months: 12, route: 'self', hours: 0.75, delay: [3, 12], odds: 0.7 },
      { id: 'accelerator', label: 'Partner / accelerator route', amount: 30000, months: 12, route: 'referral', hours: 2, delay: [14, 40], odds: 0.6, needs: { backed: true } },
    ],
  },
  {
    id: 'supabase', name: 'Supabase', group: 'Cloud', kind: 'saas', vendor: 'supabase', covers: ['hosting', 'software'], alloc: 'supabase',
    tool: { vendor: 'Supabase', monthly: 25, category: 'hosting' },
    note: 'Reported: up to six months of the Team plan free (~$3,600 value) for bootstrapped, pre-seed and seed startups.',
    requires: { website: true, domain: true },
    tiers: [{ id: 'team_free', label: 'Six months of Team plan', amount: 3600, months: 6, route: 'self', hours: 0.5, delay: [2, 8], odds: 0.8 }],
  },
  {
    id: 'posthog', name: 'PostHog for Startups', group: 'Analytics', kind: 'saas', vendor: 'posthog', covers: ['software'], alloc: 'posthog',
    tool: { vendor: 'PostHog', monthly: 60, category: 'software' },
    note: 'Aggregators report a $50k credit pool for YC companies (renewing yearly under $25M raised) plus a large free tier; the two accounts conflict.',
    requires: { website: true, domain: true },
    tiers: [
      { id: 'startup', label: 'Startup plan', amount: 2000, months: 12, route: 'self', hours: 0.5, delay: [2, 7], odds: 0.8 },
      { id: 'yc', label: 'Accelerator pool', amount: 50000, months: 12, route: 'accelerator', hours: 0.75, delay: [3, 14], odds: 0.9, needs: { accelerator: true } },
    ],
  },
  {
    id: 'mixpanel', name: 'Mixpanel for Startups', group: 'Analytics', kind: 'saas', vendor: 'mixpanel', covers: ['software'], alloc: 'mixpanel',
    tool: { vendor: 'Mixpanel', monthly: 28, category: 'software' },
    note: 'A year on the Startup plan for companies under five years old with under $8M raised; data must flow within 90 days.',
    requires: { website: true, domain: true },
    tiers: [{ id: 'startup', label: 'One year, Startup plan', amount: 1500, months: 12, route: 'self', hours: 0.5, delay: [2, 7], odds: 0.8, needs: { maxAgeYears: 5, maxRaised: 8000000 } }],
  },
  {
    id: 'segment', name: 'Segment (Twilio) startups', group: 'Analytics', kind: 'saas', vendor: 'segment', covers: ['software'], alloc: 'segment',
    tool: { vendor: 'Segment', monthly: 120, category: 'software' },
    note: 'Reported: up to $50k of Team plan credits for companies under two years old with under $5M raised.',
    requires: { website: true, domain: true },
    tiers: [{ id: 'team', label: 'Team plan credits', amount: 6000, months: 12, route: 'self', hours: 0.75, delay: [3, 10], odds: 0.7, needs: { maxAgeYears: 2, maxRaised: 5000000 } }],
  },
  {
    id: 'hubspot', name: 'HubSpot for Startups', group: 'Sales tools', kind: 'discount', vendor: 'hubspot', covers: ['software'], alloc: 'hubspot',
    tool: { vendor: 'HubSpot Professional', monthly: 800, category: 'software' },
    note: 'A discount, not credits: reported 90% off year one for partner-affiliated or verified-funded startups (stepping to 50% then 25%), ~30% for bootstrapped. Usually only new Professional / Enterprise products, not Starter.',
    requires: { website: true, domain: true },
    tiers: [
      { id: 'bootstrapped', label: '~30% off (bootstrapped)', pct: 0.3, amount: 0, months: 12, route: 'self', hours: 0.5, delay: [2, 7], odds: 0.8 },
      { id: 'backed', label: '~90% off year one (funded / partner)', pct: 0.9, amount: 0, months: 12, route: 'referral', hours: 1, delay: [7, 21], odds: 0.75, needs: { backed: true } },
    ],
  },
  {
    id: 'stripe_atlas', name: 'Stripe Atlas perks', group: 'Marketplaces', kind: 'cloud', provider: 'aws', covers: ['hosting', 'ai_inference'], alloc: 'aws',
    note: 'Atlas is a $500 incorporation service; its perks marketplace is reported at $200k-$350k+ aggregate across partners, mostly cloud credits and $2.5k-$5k of AI credits. Credits from different marketplaces can be the same underlying allocation.',
    requires: { website: true, domain: true, atlas: true },
    tiers: [
      { id: 'cloud', label: 'Partner cloud credits (AWS allocation)', amount: 5000, months: 12, route: 'self', hours: 0.5, delay: [2, 8], odds: 0.85 },
    ],
  },
  {
    id: 'ramp_perks', name: 'Ramp / Brex perk marketplace', group: 'Marketplaces', kind: 'cloud', provider: 'google', covers: ['hosting', 'ai_inference'], alloc: 'google',
    note: 'Card and bank programs bundle partner credits (cloud, $2.5k-$5k AI) and SaaS discounts. The same allocation can be listed by several marketplaces.',
    requires: { website: true, domain: true, businessBank: true },
    tiers: [{ id: 'cloud', label: 'Partner cloud credits (Google allocation)', amount: 3000, months: 12, route: 'self', hours: 0.5, delay: [1, 6], odds: 0.85 }],
  },
  {
    id: 'mercury_perks', name: 'Mercury perks', group: 'Marketplaces', kind: 'saas', vendor: 'datadog', covers: ['software'], alloc: 'datadog',
    tool: { vendor: 'Datadog', monthly: 120, category: 'software' },
    note: 'Reported: a year of Datadog (up to $100k value) appears as a Mercury banking perk; you only benefit if you run Datadog.',
    requires: { website: true, domain: true, businessBank: true },
    tiers: [{ id: 'datadog', label: 'A year of the monitoring tool', amount: 6000, months: 12, route: 'self', hours: 0.5, delay: [1, 6], odds: 0.85 }],
  },
  {
    id: 'accelerator_bundle', name: 'Accelerator partner bundle', group: 'Accelerators', kind: 'bundle', covers: [],
    note: 'Accelerators bundle partner credits (no official page checked): cloud, an AI lab and analytics. Needs an accepted or enrolled accelerator.',
    requires: { website: true, domain: true },
    tiers: [{
      id: 'bundle', label: 'Cloud + AI + analytics bundle', amount: 0, months: 24, route: 'accelerator', hours: 1, delay: [3, 14], odds: 0.95, needs: { accelerator: true },
      grants: [
        { provider: 'aws', kind: 'cloud', amount: 50000, months: 24, covers: ['hosting', 'ai_inference'], alloc: 'aws' },
        { provider: 'anthropic', kind: 'lab', amount: 10000, months: 12, covers: ['ai_inference'], alloc: 'anthropic' },
        { vendor: 'posthog', kind: 'saas', amount: 50000, months: 12, covers: ['software'], alloc: 'posthog' },
      ],
    }],
  },
];

export const programById = (id) => PROGRAMS.find((p) => p.id === id) ?? null;
export const tierById = (p, id) => p?.tiers.find((t) => t.id === id) ?? null;
export const CREDIT_PARAMS = {
  expiryWarnDays: [60, 30], // credits_expiring events fire at these horizons
  lowBalanceShare: 0.1,
  cliffPlanHours: 0.75, rightsizeHours: 10,
  adoptToolHours: 1.5, // setting up a vendor tool just because it is free
  inceptionBoost: 0.06, // NVIDIA Inception membership: partner cloud applications [design]
  qualityWeights: { website: 0.4, product: 0.35, linkedin: 0.25 }, // approval quality on the visible signals [design]
};
